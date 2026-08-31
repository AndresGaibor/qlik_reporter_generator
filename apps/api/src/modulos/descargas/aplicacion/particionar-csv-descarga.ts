import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import { createGunzip } from "node:zlib";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type {
  ArchivoGcs,
  PuertoAlmacenamientoDescargas,
} from "./puerto-almacenamiento-descargas.js";

export const MAXIMO_FILAS_DESCARGA_PREDETERMINADO = 1_000_000;
const DIRECTORIO_CACHE_ANTERIOR = "__download_cache__/";
const NUEVA_LINEA = Buffer.from("\n");
const TAMANO_LOTE_ESCRITURA = 1024 * 1024;

/**
 * Reparte uno o varios CSV fuente en partes con un máximo de filas sin
 * materializar una copia intermedia. El consumidor decide dónde escribir cada
 * parte (por ejemplo, directamente dentro de un ZIP HTTP).
 */
export async function particionarCsvDescarga(
  almacenamiento: PuertoAlmacenamientoDescargas,
  fuentes: ArchivoGcs[],
  maximoFilas: number,
  abrirDestinoParte: (nombre: string) => Writable,
): Promise<string[]> {
  validarMaximoFilas(maximoFilas);
  if (!almacenamiento.abrirLectura) {
    throw new ErrorAplicacion(
      "GCS_LECTURA_NO_DISPONIBLE",
      "El almacenamiento no permite leer CSV para preparar la descarga",
      501,
    );
  }

  const csv = fuentes
    .filter((archivo) => /\.csv(?:\.gz)?$/i.test(archivo.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (csv.length === 0) {
    throw new ErrorAplicacion(
      "CSV_FUENTE_NO_DISPONIBLE",
      "La carpeta no contiene CSV para preparar la descarga",
      422,
    );
  }

  let cabecera: Buffer | null = null;
  let destinoActual: Writable | null = null;
  let filasParte = 0;
  let indiceParte = 0;
  let lote: Buffer[] = [];
  let bytesLote = 0;
  const nombres: string[] = [];

  const vaciarLote = async () => {
    if (!destinoActual || lote.length === 0) return;
    const contenido = Buffer.concat(lote, bytesLote);
    lote = [];
    bytesLote = 0;
    if (!destinoActual.write(contenido)) await once(destinoActual, "drain");
  };

  const abrirNuevaParte = async () => {
    if (!cabecera) return;
    if (destinoActual) {
      await vaciarLote();
      await cerrarDestino(destinoActual);
    }
    indiceParte += 1;
    filasParte = 0;
    const nombre = `parte-${String(indiceParte).padStart(3, "0")}.csv`;
    destinoActual = abrirDestinoParte(nombre);
    nombres.push(nombre);
    const encabezado = Buffer.concat([cabecera, NUEVA_LINEA]);
    if (!destinoActual.write(encabezado)) await once(destinoActual, "drain");
  };

  for (const fuente of csv) {
    const lectura = abrirCsvFuente(almacenamiento, fuente);
    let primerRegistro = true;

    for await (const registro of leerRegistrosCsv(lectura)) {
      if (primerRegistro) {
        primerRegistro = false;
        if (!cabecera) cabecera = registro;
        else if (!cabecera.equals(registro)) {
          throw new ErrorAplicacion(
            "CSV_CABECERAS_INCOMPATIBLES",
            "Los archivos exportados no tienen la misma cabecera CSV",
            422,
          );
        }
        continue;
      }

      if (!cabecera) continue;
      if (!destinoActual || filasParte >= maximoFilas) {
        await abrirNuevaParte();
      }
      if (!destinoActual) continue;
      lote.push(registro, NUEVA_LINEA);
      bytesLote += registro.length + 1;
      filasParte += 1;
      if (bytesLote >= TAMANO_LOTE_ESCRITURA) await vaciarLote();
    }
  }

  if (!cabecera) {
    throw new ErrorAplicacion(
      "CSV_SIN_CABECERA",
      "No se pudo leer la cabecera de los CSV exportados",
      422,
    );
  }

  if (!destinoActual) await abrirNuevaParte();
  if (destinoActual) {
    await vaciarLote();
    await cerrarDestino(destinoActual);
  }
  return nombres;
}

export function abrirCsvFuente(
  almacenamiento: PuertoAlmacenamientoDescargas,
  archivo: ArchivoGcs,
): Readable {
  if (!almacenamiento.abrirLectura) {
    throw new ErrorAplicacion(
      "GCS_LECTURA_NO_DISPONIBLE",
      "El almacenamiento no permite leer archivos",
      501,
    );
  }
  const lectura = almacenamiento.abrirLectura(archivo.rutaCompleta);
  return archivo.nombre.toLowerCase().endsWith(".gz")
    ? lectura.pipe(createGunzip())
    : lectura;
}

/** Mantiene ocultos caches creados por versiones anteriores de la descarga. */
export function esDirectorioCacheDescargas(nombre: string): boolean {
  return (
    nombre === DIRECTORIO_CACHE_ANTERIOR ||
    nombre.startsWith(DIRECTORIO_CACHE_ANTERIOR)
  );
}

async function cerrarDestino(destino: Writable): Promise<void> {
  if (destino.writableFinished) return;
  const terminado = once(destino, "finish");
  destino.end();
  await terminado;
}

export async function* leerRegistrosCsv(
  lectura: Readable,
): AsyncGenerator<Buffer> {
  let dentroComillas = false;
  let partes: Buffer[] = [];
  let longitud = 0;

  for await (const chunkRaw of lectura) {
    const chunk = Buffer.isBuffer(chunkRaw) ? chunkRaw : Buffer.from(chunkRaw);
    let inicio = 0;

    const extraerRegistro = (fin: number) => {
      let registro: Buffer;
      if (partes.length === 0) registro = chunk.subarray(inicio, fin);
      else {
        if (fin > inicio) {
          const fragmento = chunk.subarray(inicio, fin);
          partes.push(fragmento);
          longitud += fragmento.length;
        }
        registro = Buffer.concat(partes, longitud);
      }
      if (registro.at(-1) === 0x0d) registro = registro.subarray(0, -1);
      partes = [];
      longitud = 0;
      inicio = fin + 1;
      return registro;
    };

    if (!dentroComillas && !chunk.includes(0x22)) {
      let salto = chunk.indexOf(0x0a, inicio);
      while (salto >= 0) {
        yield extraerRegistro(salto);
        salto = chunk.indexOf(0x0a, inicio);
      }
    } else {
      for (let i = 0; i < chunk.length; i += 1) {
        const byte = chunk[i];
        if (byte === 0x22) dentroComillas = !dentroComillas;
        if (byte === 0x0a && !dentroComillas) yield extraerRegistro(i);
      }
    }

    if (inicio < chunk.length) {
      const fragmento = chunk.subarray(inicio);
      partes.push(fragmento);
      longitud += fragmento.length;
    }
  }

  if (longitud > 0) yield Buffer.concat(partes, longitud);
}

function validarMaximoFilas(valor: number) {
  if (!Number.isSafeInteger(valor) || valor < 1) {
    throw new ErrorAplicacion(
      "MAXIMO_FILAS_DESCARGA_INVALIDO",
      "El máximo de filas por CSV debe ser un entero positivo",
      422,
    );
  }
}

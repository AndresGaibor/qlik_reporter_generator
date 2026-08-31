import { once } from "node:events";
import type { Writable } from "node:stream";
import { particionarCsvDescarga } from "./particionar-csv-descarga.js";
import type {
  ArchivoGcs,
  PuertoAlmacenamientoDescargas,
} from "./puerto-almacenamiento-descargas.js";

const DIRECTORIO = "__download_cache__/";
const MARCADOR = /^__completo__(?:-(\d+))?\.csv$/;
const preparaciones = new Map<string, Promise<void>>();

export function prefijoPartesNormalizadas(prefijo: string) {
  return `${prefijo}${DIRECTORIO}`;
}

export async function obtenerPartesNormalizadas(
  almacenamiento: PuertoAlmacenamientoDescargas,
  prefijo: string,
) {
  const estado = await listarPartesNormalizadas(almacenamiento, prefijo);
  return estado.completa ? estado.partes : null;
}

export async function listarPartesNormalizadas(
  almacenamiento: PuertoAlmacenamientoDescargas,
  prefijo: string,
) {
  const archivos = await almacenamiento.listar(
    prefijoPartesNormalizadas(prefijo),
  );
  const marcador = archivos.find((archivo) => MARCADOR.test(archivo.nombre));
  return {
    completa: Boolean(marcador),
    filas: marcador ? (MARCADOR.exec(marcador.nombre)?.[1] ?? null) : null,
    partes: archivos
      .filter((archivo) => /^parte-\d+\.csv$/i.test(archivo.nombre))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

export function iniciarPreparacionPartesNormalizadas(
  almacenamiento: PuertoAlmacenamientoDescargas,
  prefijo: string,
  fuentes: ArchivoGcs[],
  maximoFilas: number,
) {
  if (!almacenamiento.abrirEscritura)
    throw new Error("El almacenamiento no permite guardar partes normalizadas");
  if (preparaciones.has(prefijo)) return;
  const prefijoCache = prefijoPartesNormalizadas(prefijo);
  const tarea = (async () => {
    const { filas } = await particionarCsvDescarga(
      almacenamiento,
      fuentes,
      maximoFilas,
      (nombre) =>
        almacenamiento.abrirEscritura?.(`${prefijoCache}${nombre}`) as Writable,
    );
    const marcador = almacenamiento.abrirEscritura?.(
      `${prefijoCache}__completo__-${filas}.csv`,
    );
    if (!marcador) return;
    const terminado = once(marcador, "finish");
    marcador.end();
    await terminado;
  })().finally(() => preparaciones.delete(prefijo));
  preparaciones.set(prefijo, tarea);
  void tarea.catch(() => undefined);
}

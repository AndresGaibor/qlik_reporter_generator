import type { Writable } from "node:stream";
import ExcelJS from "exceljs";
import {
  abrirCsvFuente,
  leerRegistrosCsv,
} from "./particionar-csv-descarga.js";
import type {
  ArchivoGcs,
  PuertoAlmacenamientoDescargas,
} from "./puerto-almacenamiento-descargas.js";

export const MAXIMO_FILAS_XLSX_POR_ARCHIVO = 1_000_000;

/**
 * Convierte CSV separados por | a archivos XLSX sin cargar el resultado completo
 * en memoria. Cada libro contiene una sola hoja y como máximo un millón de filas.
 */
export async function generarXlsxDescarga(
  almacenamiento: PuertoAlmacenamientoDescargas,
  fuentes: ArchivoGcs[],
  abrirDestinoParte: (nombre: string) => Writable,
): Promise<string[]> {
  const csv = fuentes
    .filter((archivo) => /\.csv(?:\.gz)?$/i.test(archivo.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (csv.length === 0)
    throw new Error("La carpeta no contiene CSV para convertir");

  let cabecera: Buffer | null = null;
  let libro: ExcelJS.stream.xlsx.WorkbookWriter | null = null;
  let hoja: ExcelJS.Worksheet | null = null;
  let filasParte = 0;
  let indiceParte = 0;
  const nombres: string[] = [];

  const abrirNuevaParte = async () => {
    if (!cabecera) return;
    if (libro) await libro.commit();
    indiceParte += 1;
    filasParte = 0;
    const nombre = `parte-${String(indiceParte).padStart(3, "0")}.xlsx`;
    libro = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: abrirDestinoParte(nombre),
      useSharedStrings: false,
      useStyles: false,
    });
    hoja = libro.addWorksheet("Datos");
    hoja.addRow(parsearFilaCsv(cabecera)).commit();
    nombres.push(nombre);
  };

  for (const fuente of csv) {
    let primerRegistro = true;
    for await (const registro of leerRegistrosCsv(
      abrirCsvFuente(almacenamiento, fuente),
    )) {
      if (primerRegistro) {
        primerRegistro = false;
        if (!cabecera) cabecera = registro;
        else if (!cabecera.equals(registro))
          throw new Error(
            "Los archivos exportados no tienen la misma cabecera CSV",
          );
        continue;
      }
      if (!cabecera) continue;
      if (!libro || filasParte >= MAXIMO_FILAS_XLSX_POR_ARCHIVO)
        await abrirNuevaParte();
      (hoja as unknown as ExcelJS.Worksheet)
        .addRow(parsearFilaCsv(registro))
        .commit();
      filasParte += 1;
    }
  }

  if (!cabecera)
    throw new Error("No se pudo leer la cabecera de los CSV exportados");
  if (!libro) await abrirNuevaParte();
  if (libro) await (libro as ExcelJS.stream.xlsx.WorkbookWriter).commit();
  return nombres;
}

function parsearFilaCsv(registro: Buffer): string[] {
  const texto = registro.toString("utf8");
  const valores: string[] = [];
  let valor = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (caracter === '"') {
      if (entreComillas && texto[i + 1] === '"') {
        valor += '"';
        i += 1;
      } else entreComillas = !entreComillas;
    } else if (caracter === "|" && !entreComillas) {
      valores.push(valorSeguroParaExcel(valor));
      valor = "";
    } else valor += caracter;
  }
  valores.push(valorSeguroParaExcel(valor));
  return valores;
}

function valorSeguroParaExcel(valor: string): string {
  return /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
}

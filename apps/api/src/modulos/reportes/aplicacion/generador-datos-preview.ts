import type { ColumnaPreviewBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";

export interface OpcionesGeneradorDatosPreview {
  columnas: ColumnaPreviewBigQuery[];
  cantidadFilas?: number;
  semilla: string;
  clavesJoin?: string[];
}

export interface DatosPreviewGenerados {
  columnas: string[];
  filas: string[][];
}

const MAX_FILAS_SINTETICAS = 10;

export function generarDatosPreview(
  opciones: OpcionesGeneradorDatosPreview,
): DatosPreviewGenerados {
  const cantidadFilas = Math.max(
    0,
    Math.min(MAX_FILAS_SINTETICAS, opciones.cantidadFilas ?? 5),
  );
  const clavesJoin = new Set((opciones.clavesJoin ?? []).map(normalizarNombre));

  return {
    columnas: opciones.columnas.map((columna) => columna.nombre),
    filas: Array.from({ length: cantidadFilas }, (_, indice) =>
      opciones.columnas.map((columna) =>
        generarValor(columna, indice, opciones.semilla, clavesJoin),
      ),
    ),
  };
}

function generarValor(
  columna: ColumnaPreviewBigQuery,
  indice: number,
  semilla: string,
  clavesJoin: Set<string>,
): string {
  const nombre = normalizarNombre(columna.nombre);
  const fila = indice + 1;
  const esClaveJoin = clavesJoin.has(nombre);

  if (esAnio(nombre)) return "2026";
  if (esMes(nombre)) return "Julio";
  if (tipoEsTemporal(columna.tipo)) {
    return valorPorTipo(columna.tipo, indice) ?? fechaPorIndice(indice);
  }
  if (esFecha(nombre)) return fechaPorIndice(indice);
  if (esCodigoBarras(nombre))
    return `786${String(1234567890 + indice).padStart(10, "0")}`;

  if (/\bsub bodega\b/.test(nombre)) return `Sub bodega ${pad2(fila)}`;
  if (/\bbodega\b/.test(nombre)) return `Bodega ${pad2(fila)}`;
  if (/\bdivision\b/.test(nombre)) return `División ${letra(indice)}`;
  if (/\bdepartamento\b/.test(nombre)) return "Departamento Ejemplo";
  if (/\bproveedor\b/.test(nombre)) return "Proveedor Ejemplo";
  if (/\bzona\b/.test(nombre)) return `Zona ${letra(indice)}`;
  if (/\bformato\b/.test(nombre)) return "Formato Ejemplo";
  if (/\bunidad operativa\b/.test(nombre))
    return `Unidad Operativa ${pad2(fila)}`;
  if (/\bcod ref\b|\breferencia\b/.test(nombre)) return `REF-${1000 + fila}`;
  if (/\bneto venta\b|precio|\bventa(s)?\b/.test(nombre)) {
    return (26.4 + indice * 1.25).toFixed(2);
  }
  if (/costo|cto moneda|valor costo/.test(nombre)) {
    return (18.75 + indice * 0.85).toFixed(2);
  }
  if (
    /cantidad|disponible|inventario|saldo|num unidades|numero cajas|disp surtir/.test(
      nombre,
    )
  ) {
    return String(24 + indice * 3);
  }

  if (esClaveJoin) {
    return String(1000 + fila);
  }

  if (/^(id|cod|codigo)(\b| )|\b(id|cod|codigo)$/.test(nombre)) {
    return String(1000 + fila);
  }

  const porTipo = valorPorTipo(columna.tipo, indice);
  if (porTipo !== undefined) return porTipo;

  const etiqueta = etiquetaLegible(columna.nombre);
  const variacion = hash(`${semilla}:${nombre}`) % 3;
  return variacion === 0
    ? `${etiqueta} Ejemplo ${fila}`
    : `${etiqueta} Ejemplo`;
}

function valorPorTipo(
  tipo: string | undefined,
  indice: number,
): string | undefined {
  const normalizado = tipo?.toUpperCase();
  switch (normalizado) {
    case "INTEGER":
    case "INT64":
      return String(100 + indice);
    case "NUMERIC":
    case "BIGNUMERIC":
    case "FLOAT":
    case "FLOAT64":
      return (125.5 + indice * 7.25).toFixed(2);
    case "BOOLEAN":
    case "BOOL":
      return indice % 2 === 0 ? "Sí" : "No";
    case "DATE":
      return fechaPorIndice(indice);
    case "DATETIME":
      return `${fechaPorIndice(indice)} ${horaPorIndice(indice)}`;
    case "TIMESTAMP":
      return `${fechaPorIndice(indice)}T${horaPorIndice(indice)}Z`;
    case "TIME":
      return horaPorIndice(indice);
    case "STRING":
      return `Ejemplo ${indice + 1}`;
    default:
      return undefined;
  }
}

function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/[\[\]`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function esAnio(nombre: string): boolean {
  return /(^|\b)(ano|anio|year)(\b|$)/.test(nombre);
}

function esMes(nombre: string): boolean {
  return (
    nombre === "mes" || /(^|\b)(nom mes|nombre mes|month)(\b|$)/.test(nombre)
  );
}

function esFecha(nombre: string): boolean {
  return /(^|\b)(fecha|date)(\b|$)/.test(nombre);
}

function esCodigoBarras(nombre: string): boolean {
  return /codigo de barras|codigo barras|barcode/.test(nombre);
}

function tipoEsTemporal(tipo: string | undefined): boolean {
  return ["DATE", "DATETIME", "TIMESTAMP", "TIME"].includes(
    tipo?.toUpperCase() ?? "",
  );
}

function fechaPorIndice(indice: number): string {
  return `2026-07-${pad2(1 + (indice % 28))}`;
}

function horaPorIndice(indice: number): string {
  return `${pad2(10 + (indice % 8))}:30:00`;
}

function pad2(valor: number): string {
  return String(valor).padStart(2, "0");
}

function letra(indice: number): string {
  return String.fromCharCode(65 + (indice % 26));
}

function etiquetaLegible(nombre: string): string {
  return nombre
    .replace(/[_-]+/g, " ")
    .replace(/[\[\]`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(valor: string): number {
  let resultado = 2166136261;
  for (const caracter of valor) {
    resultado ^= caracter.charCodeAt(0);
    resultado = Math.imul(resultado, 16777619);
  }
  return resultado >>> 0;
}

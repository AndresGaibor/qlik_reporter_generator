export interface CampoReporte {
  nombre: string;
  tipo: string;
}

const TIPOS_FECHA = ["DATE", "DATETIME", "TIMESTAMP", "TIME"];
const TIPOS_NUMERICOS = [
  "INTEGER",
  "INT64",
  "FLOAT",
  "FLOAT64",
  "NUMERIC",
  "BIGNUMERIC",
  "DECIMAL",
];

export function esCampoFecha(campo: CampoReporte) {
  return TIPOS_FECHA.some((tipo) => campo.tipo.toUpperCase().includes(tipo));
}

export function esCampoNumerico(campo: CampoReporte) {
  const tipo = campo.tipo.toUpperCase();
  return TIPOS_NUMERICOS.some((actual) => tipo.includes(actual));
}

export function detectarCamposFecha(columnas: CampoReporte[]) {
  return columnas.filter(esCampoFecha).map((campo) => campo.nombre);
}
function prioridadCampo(campo: CampoReporte) {
  const nombre = campo.nombre.toLowerCase();
  if (esCampoFecha(campo)) return 0;
  if (/(^|_)(id|codigo|code|clave)(_|$)/.test(nombre)) return 1;
  if (esCampoNumerico(campo)) return 2;
  return 3;
}

export function seleccionarCamposIniciales(
  columnas: CampoReporte[],
  limite = 12,
) {
  return columnas
    .map((campo, indice) => ({ campo, indice }))
    .sort(
      (a, b) =>
        prioridadCampo(a.campo) - prioridadCampo(b.campo) ||
        a.indice - b.indice,
    )
    .slice(0, limite)
    .map(({ campo }) => campo.nombre);
}

export function formatearCostoUsd(valor: number) {
  return `${new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)} USD`.replace("US$", "$ ").replace("$ ", "$");
}
export function formatearBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const indice = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    unidades.length - 1,
  );
  const valor = bytes / 1024 ** indice;
  return `${valor.toLocaleString("es-EC", {
    minimumFractionDigits: indice >= 2 ? 2 : 0,
    maximumFractionDigits: 2,
  })} ${unidades[indice]}`;
}

export function humanizarNombreTabla(nombre: string) {
  const palabras = nombre
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.at(-1)?.length === 1) palabras.pop();
  const texto = palabras.join(" ").toLowerCase();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Nuevo reporte";
}

export function obtenerRequisitoPendiente({
  tabla,
  campoFecha,
  fechaDesde,
  fechaHasta,
  columnas,
}: {
  tabla?: string;
  campoFecha?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  columnas: string[];
}) {
  if (!tabla) return "Selecciona una tabla para crear el reporte.";
  if (!campoFecha) return "Selecciona el campo de fecha del reporte.";
  if (!fechaDesde || !fechaHasta)
    return "Selecciona un periodo para crear el reporte.";
  if (columnas.length === 0)
    return "Selecciona al menos un campo para crear el reporte.";
  return null;
}
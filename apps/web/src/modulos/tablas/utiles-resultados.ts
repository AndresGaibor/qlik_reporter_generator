import type { RecursoDestino } from "@/modulos/reportes/api";

export function filtrarRecursos(
  recursos: RecursoDestino[],
  busqueda: string,
): RecursoDestino[] {
  const termino = busqueda.trim().toLocaleLowerCase("es");
  if (!termino) return recursos;
  return recursos.filter((recurso) =>
    `${recurso.nombre} ${recurso.id}`.toLocaleLowerCase("es").includes(termino),
  );
}

export function obtenerColumnasPreview(
  filas: Array<Record<string, unknown>>,
): string[] {
  const columnas = new Set<string>();
  for (const fila of filas) {
    for (const columna of Object.keys(fila)) columnas.add(columna);
  }
  return [...columnas];
}

export function formatearValorResultado(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    if ("value" in valor && valor.value !== null && valor.value !== undefined) {
      return String(valor.value);
    }
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}

export function formatearFechaResultado(valor?: string): string {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);
}

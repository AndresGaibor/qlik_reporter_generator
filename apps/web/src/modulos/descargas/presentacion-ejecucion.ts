import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import type { EstadoResumenDescarga } from "@qlik/contratos/descargas";

export interface EjecucionDescargaUI extends ResumenDescargaEjecucion {
  estado: EstadoResumenDescarga;
}

export type PropsPresentacion =
  | { tipo: "preparando" | "iniciada" }
  | { tipo: "completada" }
  | { tipo: "error"; mensaje: string | null }
  | { tipo: "detenida" };

export function presentarEjecucion(
  ejecucion: ResumenDescargaEjecucion,
): PropsPresentacion {
  switch (ejecucion.estado) {
    case "preparando":
    case "iniciada":
      return { tipo: ejecucion.estado };
    case "completada":
      return { tipo: "completada" };
    case "error":
      return { tipo: "error", mensaje: ejecucion.mensajeError };
    case "detenida":
      return { tipo: "detenida" };
    default:
      return { tipo: "error", mensaje: "Estado desconocido" };
  }
}

export function esEstadoActivo(estado: EstadoResumenDescarga): boolean {
  return estado === "preparando" || estado === "iniciada";
}

export function formatearFechaISO(fechaISO: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(fechaISO));
}

export function formatearTamano(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const tamanos = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${tamanos[i]}`;
}

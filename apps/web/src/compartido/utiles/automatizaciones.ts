import type { ResumenAutomatizacion } from "@/modulos/reportes/api";
import {
  calcularDuracion,
  presentarEstadoEjecucion,
} from "@/modulos/reportes/utiles-presentacion-reporte";
import { formatearFechaYHora } from "./formateador-fechas";

export function estadoVisual(auto: ResumenAutomatizacion): string {
  if (auto.ejecucionActiva) return "En ejecución";
  if (!auto.activa) return "Inactivo";

  if (auto.ultimaEjecucionEstado) {
    const ultima = presentarEstadoEjecucion(auto.ultimaEjecucionEstado);
    if (ultima.tono === "error") return "Requiere atención";
  }

  return "Disponible";
}

export function claseEstado(auto: ResumenAutomatizacion): string {
  const estado = estadoVisual(auto);

  if (estado === "En ejecución") {
    return "border border-warning-200 bg-warning-50 text-warning-700";
  }
  if (estado === "Requiere atención") {
    return "border border-danger-200 bg-danger-50 text-danger-700";
  }
  if (estado === "Inactivo") {
    return "border border-line-200 bg-app text-ink-500";
  }

  return "border border-brand-200 bg-brand-50 text-brand-700";
}

export function resumenUltimaEjecucion(auto: ResumenAutomatizacion): string {
  const estadoTecnico = auto.ultimaEjecucionEstado;
  const inicio = auto.ultimaEjecucionInicio;

  if (!estadoTecnico && !inicio) return "Aún no se ha ejecutado";

  const estado = presentarEstadoEjecucion(estadoTecnico ?? "");
  const fecha = inicio ? formatearFechaYHora(inicio) : "—";

  if (estado.enCurso) {
    return `${estado.etiqueta} · inició ${fecha}`;
  }

  const duracion = calcularDuracion(inicio, auto.ultimaEjecucionFin);
  return [estado.etiqueta, fecha, duracion]
    .filter((parte) => parte !== "—")
    .join(" · ");
}

export function sufijoBusqueda(espacioId?: string): string {
  return espacioId ? `?espacioId=${encodeURIComponent(espacioId)}` : "";
}

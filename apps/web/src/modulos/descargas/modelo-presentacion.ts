import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { presentarEjecucion } from "./presentacion-ejecucion";

export interface ReporteDescarga {
  flujoIdQlik: string;
  nombre: string;
  ejecuciones: ResumenDescargaEjecucion[];
  ultimaEjecucion: ResumenDescargaEjecucion;
}

export function agruparEjecucionesPorReporte(
  ejecuciones: ResumenDescargaEjecucion[],
): ReporteDescarga[] {
  const grupos = new Map<string, ResumenDescargaEjecucion[]>();
  for (const ejecucion of ejecuciones) {
    const grupo = grupos.get(ejecucion.flujoIdQlik) ?? [];
    grupo.push(ejecucion);
    grupos.set(ejecucion.flujoIdQlik, grupo);
  }

  return [...grupos.entries()]
    .map(([flujoIdQlik, items]) => {
      const ordenadas = [...items].sort(
        (a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn),
      );
      return {
        flujoIdQlik,
        nombre: ordenadas[0]?.reporteNombre || "Reporte sin nombre",
        ejecuciones: ordenadas,
        ultimaEjecucion: ordenadas[0],
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.ultimaEjecucion.creadoEn) -
        Date.parse(a.ultimaEjecucion.creadoEn),
    );
}

export function presentarNombreArchivo(
  nombre: string,
  posicion: number,
  total: number,
): string {
  const coincide = nombre.match(/^parte-(\d+)\.(.+)$/i);
  if (coincide && total > 1) return `Parte ${posicion + 1} de ${total}`;
  return nombre;
}

export function calcularResumenEjecucion(ejecucion: ResumenDescargaEjecucion) {
  return {
    archivos: ejecucion.archivos.length,
    tamano: ejecucion.archivos.reduce(
      (total, archivo) => total + archivo.tamano,
      0,
    ),
    estado: presentarEjecucion(ejecucion),
  };
}

export function presentarEjecucionDescarga(
  ejecucion: ResumenDescargaEjecucion,
) {
  const presentacion = presentarEjecucion(ejecucion);
  if (presentacion.tipo === "error") {
    return { ...presentacion, mensaje: "No se pudo generar este resultado." };
  }
  return presentacion;
}

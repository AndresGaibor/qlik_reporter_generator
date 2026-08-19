import { clienteApi } from "@/compartido/api/cliente";
import type {
  DetalleEjecucionReporte,
  DetalleReporte,
  PreflightDataflowReporte,
  ResumenReporte,
} from "@qlik/contratos";
import type { ResumenAutomatizacion } from "@qlik/contratos/automatizaciones";
import type {
  DataflowBaseDisponible,
  ResultadoClonarDataflowBase,
  ResumenReporteDataflow,
} from "@qlik/contratos/flujos";

const RUTA = "/reportes";
const RUTA_AUTOMATIZACIONES_QLIK = "/qlik/automatizaciones";

function idUrl(id: string) {
  return `${RUTA}/${encodeURIComponent(id)}`;
}

export function obtenerReportes(espacioId?: string, busqueda?: string) {
  if (!espacioId && !busqueda) return clienteApi.get<ResumenReporte[]>(RUTA);
  return clienteApi.get<ResumenReporte[]>(RUTA, {
    parametros: {
      ...(espacioId ? { espacioId } : {}),
      ...(busqueda ? { q: busqueda } : {}),
    },
  });
}

export function obtenerReporte(id: string) {
  return clienteApi.get<DetalleReporte>(idUrl(id));
}

export function obtenerResumenReporte(flujoId: string) {
  return clienteApi.get<ResumenReporteDataflow>(`${idUrl(flujoId)}/resumen`);
}

export function obtenerDataflowBaseReporte() {
  return clienteApi.get<DataflowBaseDisponible>(`${RUTA}/plantilla-base`);
}

export function crearReporteDesdePlantilla(nombre: string) {
  return clienteApi.post<ResultadoClonarDataflowBase>(
    `${RUTA}/desde-plantilla`,
    { nombre },
  );
}

export function obtenerEjecucionesReporte(id: string) {
  return clienteApi.get<DetalleEjecucionReporte[]>(`${idUrl(id)}/ejecuciones`);
}

export function ejecutarReporte(id: string) {
  return clienteApi.post<{ runId: string; ejecucionReporteId?: string }>(
    `${idUrl(id)}/ejecuciones`,
  );
}

export function preflightDataflowReporte(flujoId: string) {
  return clienteApi.get<PreflightDataflowReporte>(
    `${idUrl(flujoId)}/preflight`,
  );
}

export type { ResumenAutomatizacion };
export function obtenerAutomatizaciones() {
  return clienteApi.get<ResumenAutomatizacion[]>(RUTA_AUTOMATIZACIONES_QLIK);
}
export function obtenerAutomatizacionesConFiltros(
  espacioId?: string,
  busqueda?: string,
) {
  return clienteApi.get<ResumenAutomatizacion[]>(RUTA_AUTOMATIZACIONES_QLIK, {
    parametros: {
      ...(espacioId ? { espacioId } : {}),
      ...(busqueda ? { q: busqueda } : {}),
    },
  });
}

import { clienteApi } from "@/compartido/api/cliente";
import type {
  ActualizarConfiguracionReporte,
  ConfiguracionReporteDataflow,
  CrearReporte,
  DetalleEjecucionReporte,
  DetalleReporte,
  PreflightDataflowReporte,
  ResumenReporte,
} from "@qlik/contratos";
import type { ResumenAutomatizacion } from "@qlik/contratos/automatizaciones";
import type { DetalleAutomatizacion } from "@qlik/contratos/automatizaciones";

const RUTA = "/reportes";

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

export function crearReporte(entrada: CrearReporte) {
  return clienteApi.post<DetalleReporte>(RUTA, entrada);
}

export function actualizarReporte(
  id: string,
  entrada: ActualizarConfiguracionReporte,
) {
  return clienteApi.put<DetalleReporte>(idUrl(id), entrada);
}

export function clonarReporte(id: string, opciones?: { nombre?: string }) {
  return clienteApi.post<DetalleReporte>(`${idUrl(id)}/clonar`, opciones ?? {});
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
    `${RUTA}/dataflows/${encodeURIComponent(flujoId)}/preflight`,
  );
}

export function obtenerConfiguracionReporte(id: string) {
  return clienteApi.get<ConfiguracionReporteDataflow>(`${idUrl(id)}`);
}

export function actualizarConfiguracionReporte(
  id: string,
  entrada: ActualizarConfiguracionReporte,
) {
  return actualizarReporte(id, entrada);
}

export function obtenerEjecucionesLocalesReporte(id: string) {
  return obtenerEjecucionesReporte(id);
}

// Compatibilidad temporal para módulos de Dataflow que Task 9 retirará.
export type { ResumenAutomatizacion };
export type { DetalleAutomatizacion };
export type EjecucionResumen = DetalleAutomatizacion["ejecuciones"][number];
export function obtenerAutomatizaciones() {
  return clienteApi.get<ResumenAutomatizacion[]>(RUTA);
}
export function obtenerAutomatizacionesConFiltros(
  espacioId?: string,
  busqueda?: string,
) {
  return clienteApi.get<ResumenAutomatizacion[]>(RUTA, {
    parametros: {
      ...(espacioId ? { espacioId } : {}),
      ...(busqueda ? { q: busqueda } : {}),
    },
  });
}

export interface WorkspaceAutomatizacion {
  id: string;
  nombre: string;
  workspace: Record<string, unknown>;
  schedules: Array<Record<string, unknown>>;
}
export function obtenerWorkspaceAutomatizacion(id: string) {
  return clienteApi.get<WorkspaceAutomatizacion>(`${idUrl(id)}/workspace`);
}

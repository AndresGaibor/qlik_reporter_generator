import { clienteApi } from "@/compartido/api/cliente";
import type {
  ActualizarConfiguracionReporte,
  ConfiguracionReporteDataflow,
  DetalleEjecucionReporte,
  PreflightDataflowReporte,
} from "@qlik/contratos";
import type {
  CrearDesdePlantilla,
  DetalleAutomatizacion,
  EspacioDisponible,
  ResultadoCrearDesdePlantilla,
  ResumenAutomatizacion,
} from "@qlik/contratos/automatizaciones";

const RUTA = "/reportes";

export interface ConfiguracionTenant {
  automatizacionBaseIdQlik: string | null;
  automatizacionBaseNombre: string | null;
}

export function preflightDataflowReporte(
  flujoId: string,
): Promise<PreflightDataflowReporte> {
  return clienteApi.get<PreflightDataflowReporte>(
    `${RUTA}/dataflows/${encodeURIComponent(flujoId)}/preflight`,
  );
}

export function obtenerConfiguracionReporte(
  automatizacionId: string,
): Promise<ConfiguracionReporteDataflow> {
  return clienteApi.get<ConfiguracionReporteDataflow>(
    `${RUTA}/${encodeURIComponent(automatizacionId)}/configuracion`,
  );
}

export function actualizarConfiguracionReporte(
  automatizacionId: string,
  entrada: ActualizarConfiguracionReporte,
): Promise<ConfiguracionReporteDataflow> {
  return clienteApi.put<ConfiguracionReporteDataflow>(
    `${RUTA}/${encodeURIComponent(automatizacionId)}/configuracion`,
    entrada,
  );
}

export function obtenerEjecucionesLocalesReporte(
  automatizacionId: string,
): Promise<DetalleEjecucionReporte[]> {
  return clienteApi.get<DetalleEjecucionReporte[]>(
    `${RUTA}/${encodeURIComponent(automatizacionId)}/ejecuciones-locales`,
  );
}

export function obtenerConfiguracionTenant(): Promise<ConfiguracionTenant> {
  return clienteApi.get<ConfiguracionTenant>(`${RUTA}/configuracion-tenant`);
}

export type {
  CrearDesdePlantilla,
  DetalleAutomatizacion,
  EspacioDisponible,
  ResumenAutomatizacion,
  ResultadoCrearDesdePlantilla,
};
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

export function obtenerDetalleAutomatizacion(id: string) {
  return clienteApi.get<DetalleAutomatizacion>(
    `${RUTA}/${encodeURIComponent(id)}`,
  );
}

export function obtenerEspacios() {
  return clienteApi.get<EspacioDisponible[]>(`${RUTA}/espacios`);
}

export function ejecutarAutomatizacion(id: string) {
  return clienteApi.post<{ runId: string }>(
    `${RUTA}/${encodeURIComponent(id)}/ejecuciones`,
  );
}

export function detenerEjecucion(id: string, ejecucionId: string) {
  return clienteApi.post<{ detenida: true }>(
    `${RUTA}/${encodeURIComponent(id)}/ejecuciones/${encodeURIComponent(ejecucionId)}/detener`,
  );
}

export function crearAutomatizacionDesdePlantilla(
  entrada: Omit<CrearDesdePlantilla, "plantillaIdQlik"> & {
    plantillaIdQlik?: string;
  },
) {
  const clave = entrada.claveIdempotencia ?? crypto.randomUUID();
  return clienteApi.post<ResultadoCrearDesdePlantilla>(
    `${RUTA}/desde-plantilla`,
    { ...entrada, claveIdempotencia: clave },
    { headers: { "idempotency-key": clave } },
  );
}

export interface WorkspaceAutomatizacion {
  id: string;
  nombre: string;
  workspace: Record<string, unknown>;
  schedules: Array<Record<string, unknown>>;
}

export function obtenerWorkspaceAutomatizacion(id: string) {
  return clienteApi.get<WorkspaceAutomatizacion>(
    `${RUTA}/${encodeURIComponent(id)}/workspace`,
  );
}

export function clonarAutomatizacion(
  id: string,
  opciones?: { nombre?: string; espacioIdQlik?: string },
) {
  return clienteApi.post<{ id: string; nombre: string }>(
    `${RUTA}/${encodeURIComponent(id)}/clonar`,
    opciones ?? {},
  );
}

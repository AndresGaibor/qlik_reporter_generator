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
import type {
  CapacidadesDestino,
  ConexionDestino,
  CrearConexionDestino,
  RecursoDestino,
  TipoDestino,
} from "@qlik/contratos/destinos";

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

export type {
  ConexionDestino,
  CapacidadesDestino,
  RecursoDestino,
  TipoDestino,
};

/** Conexiones de destino configuradas para la organización */
export function obtenerConexionesDestino(): Promise<ConexionDestino[]> {
  return clienteApi.get<ConexionDestino[]>("/destinos/conexiones");
}

/** Prueba la conexión de un destino */
export function probarConexionDestino(id: string): Promise<{
  exitoso: boolean;
  mensaje: string;
  capacidades?: CapacidadesDestino;
}> {
  return clienteApi.post(
    `/destinos/conexiones/${encodeURIComponent(id)}/probar`,
    {},
  );
}

/** Recursos disponibles en una conexión de destino */
export function obtenerRecursosDestino(id: string): Promise<RecursoDestino[]> {
  return clienteApi.get<RecursoDestino[]>(
    `/destinos/conexiones/${encodeURIComponent(id)}/recursos`,
  );
}

/** Detalle de un recurso específico */
export function obtenerDetalleRecursoDestino(
  conexionId: string,
  recursoId: string,
): Promise<RecursoDestino & { totalFilas?: number; actualizadoEn: string }> {
  return clienteApi.get(
    `/destinos/conexiones/${encodeURIComponent(conexionId)}/recursos/${encodeURIComponent(recursoId)}`,
  );
}

export function obtenerVistaPreviaDestino(
  conexionId: string,
  recursoId: string,
  limite = 20,
) {
  return clienteApi.get<Array<Record<string, unknown>>>(
    `/destinos/conexiones/${encodeURIComponent(conexionId)}/recursos/${encodeURIComponent(recursoId)}/preview`,
    { parametros: { limite: String(limite) } },
  );
}

export function obtenerDdlDestino(conexionId: string, recursoId: string) {
  return clienteApi.get<{ ddl: string | null }>(
    `/destinos/conexiones/${encodeURIComponent(conexionId)}/recursos/${encodeURIComponent(recursoId)}/ddl`,
  );
}

export function estimarConsultaDestino(
  conexionId: string,
  entrada: {
    query?: string;
    recursoId?: string;
    columnas?: string[];
    campoFecha?: string;
    fechaDesde?: string;
    fechaHasta?: string;
  },
) {
  return clienteApi.post<{
    bytesProcesados: number;
    costoEstimadoUsd: number;
    queryGenerada?: string;
  }>(`/destinos/conexiones/${encodeURIComponent(conexionId)}/estimar`, entrada);
}

/** Capacidades de una conexión de destino */
export function obtenerCapacidadesDestino(
  id: string,
): Promise<CapacidadesDestino> {
  return clienteApi.get<CapacidadesDestino>(
    `/destinos/conexiones/${encodeURIComponent(id)}/capacidades`,
  );
}

/** Crea una nueva conexión de destino */
export function crearConexionDestino(
  entrada: CrearConexionDestino,
): Promise<{ id: string }> {
  return clienteApi.post("/destinos/conexiones", entrada);
}

export function obtenerFlujosConFiltros(espacioId?: string) {
  return clienteApi.get<import("@qlik/contratos").ResumenFlujo[]>("/flujos", {
    parametros: espacioId ? { espacioId } : undefined,
  });
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

export function actualizarWorkspaceAutomatizacion(
  id: string,
  workspace: Record<string, unknown>,
  nombre?: string,
) {
  return clienteApi.put<WorkspaceAutomatizacion>(
    `${RUTA}/${encodeURIComponent(id)}/workspace`,
    { workspace, ...(nombre?.trim() ? { nombre: nombre.trim() } : {}) },
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

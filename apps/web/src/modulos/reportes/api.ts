import { clienteApi } from "@/compartido/api/cliente";
import type {
  CompartirReporte,
  DetalleEjecucionReporte,
  DetalleReporte,
  PreflightDataflowReporte,
  ResumenReporte,
} from "@qlik/contratos";
import type { ResumenAutomatizacion } from "@qlik/contratos/automatizaciones";
import type { UsuarioCompartible } from "@qlik/contratos/descargas";
import type {
  DataflowBaseDisponible,
  ResultadoClonarDataflowBase,
  ResumenReporteDataflow,
} from "@qlik/contratos/flujos";

export type ResumenReporteConDescargas = ResumenReporte & {
  carpetaDescargas: string;
};
export type DetalleReporteConDescargas = DetalleReporte & {
  carpetaDescargas: string;
};

const RUTA = "/reportes";
const RUTA_AUTOMATIZACIONES_QLIK = "/qlik/automatizaciones";

function idUrl(id: string) {
  return `${RUTA}/${encodeURIComponent(id)}`;
}

export function obtenerReportes(
  espacioId?: string,
  busqueda?: string,
  vistaUsuarioFinal = false,
) {
  if (!espacioId && !busqueda && !vistaUsuarioFinal)
    return clienteApi.get<ResumenReporteConDescargas[]>(RUTA);
  return clienteApi.get<ResumenReporteConDescargas[]>(RUTA, {
    parametros: {
      ...(espacioId ? { espacioId } : {}),
      ...(busqueda ? { q: busqueda } : {}),
      ...(vistaUsuarioFinal ? { vistaUsuarioFinal: true } : {}),
    },
  });
}

export function obtenerReporte(id: string) {
  return clienteApi.get<DetalleReporteConDescargas>(idUrl(id));
}

export function listarUsuariosCompartiblesReporte() {
  return clienteApi.get<UsuarioCompartible[]>(`${RUTA}/usuarios-compartibles`);
}

export function obtenerCompartidoReporte(id: string) {
  return clienteApi.get<CompartirReporte>(`${idUrl(id)}/compartido`);
}

export function guardarCompartidoReporte(
  id: string,
  entrada: CompartirReporte,
) {
  return clienteApi.put<CompartirReporte>(`${idUrl(id)}/compartido`, entrada);
}

export function obtenerResumenReporte(flujoId: string) {
  return clienteApi.get<ResumenReporteDataflow>(`${idUrl(flujoId)}/resumen`);
}

export function obtenerDataflowBaseReporte() {
  return clienteApi.get<DataflowBaseDisponible>(`${RUTA}/plantilla-base`);
}

export function obtenerPlantillasDataflowReporte() {
  return clienteApi.get<DataflowBaseDisponible[]>(`${RUTA}/plantillas`);
}

export function crearReporteDesdePlantilla(
  nombre: string,
  plantillaId?: string,
) {
  return clienteApi.post<ResultadoClonarDataflowBase>(
    `${RUTA}/desde-plantilla`,
    { nombre, plantillaId },
  );
}

export function obtenerEjecucionesReporte(id: string) {
  return clienteApi.get<DetalleEjecucionReporte[]>(`${idUrl(id)}/ejecuciones`);
}

export function ejecutarReporte(id: string) {
  return clienteApi.post<{
    runId: string;
    ejecucionReporteId: string;
    carpetaDescargas: string;
  }>(`${idUrl(id)}/ejecuciones`);
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

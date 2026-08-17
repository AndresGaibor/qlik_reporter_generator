export type EstadoConfiguracionReporte =
  | "pendiente"
  | "creando"
  | "activa"
  | "error"
  | "desactivada"
  | "eliminada";

export interface CrearConfiguracionReportePersistida {
  organizacionId: string;
  tenantQlikId: string;
  creadoPorUsuarioId: string;
  nombre: string;
  flujoIdQlik: string;
  flujoNombreSnapshot: string;
  flujoEspacioIdQlik?: string;
  destinoProveedor: string;
  destinoIdExterno: string;
  destinoNombreSnapshot: string;
  automatizacionIdQlik: string;
  automatizacionNombreSnapshot: string;
  estado: EstadoConfiguracionReporte;
  claveIdempotencia?: string;
}

export interface ConfiguracionReportePersistida
  extends CrearConfiguracionReportePersistida {
  id: string;
}

export type EstadoEjecucionReportePersistida =
  | "preparando"
  | "iniciada"
  | "completada"
  | "error"
  | "detenida";

export interface CrearEjecucionReportePersistida {
  id: string;
  configuracionId: string;
  flujoIdQlik: string;
  automatizacionIdQlik: string;
  hashDataflowSha256: string;
  scriptDataflow: string;
  sqlBigQueryCompilado: string;
  scriptExportacion: string;
  uriBaseGcs: string;
  tipoEjecucion: "manual";
  estado: "preparando";
  versionCompilador: number;
}

export interface EjecucionReportePersistida
  extends Omit<CrearEjecucionReportePersistida, "estado"> {
  estado: EstadoEjecucionReportePersistida;
  runIdQlik?: string | null;
  etapaError?: string | null;
  mensajeError?: string | null;
  iniciadoEn?: Date | null;
  finalizadoEn?: Date | null;
  creadoEn?: Date;
}

export interface ActualizarConfiguracionReportePersistida {
  nombre?: string;
  flujoIdQlik?: string;
  flujoNombreSnapshot?: string;
  flujoEspacioIdQlik?: string | null;
  automatizacionNombreSnapshot?: string;
  estado?: EstadoConfiguracionReporte;
}

export interface ResumenEjecucionDescarga {
  id: string;
  reporteNombre: string;
  automatizacionIdQlik: string;
  estado: string;
  mensajeError: string | null;
  uriBaseGcs: string;
  creadoEn: Date;
  finalizadoEn: Date | null;
}

export interface PuertoRepositorioReportes {
  crearConfiguracion(
    entrada: CrearConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida>;
  obtenerPorAutomatizacion(
    tenantQlikId: string,
    automatizacionIdQlik: string,
  ): Promise<ConfiguracionReportePersistida | null>;
  crearEjecucion(
    entrada: CrearEjecucionReportePersistida,
  ): Promise<EjecucionReportePersistida>;
  marcarEjecucionIniciada(
    id: string,
    runIdQlik: string,
    iniciadoEn: Date,
  ): Promise<void>;
  marcarEjecucionError(
    id: string,
    etapaError: string,
    mensajeError: string,
    finalizadoEn: Date,
  ): Promise<void>;
  obtenerConfiguracionPorId(
    configuracionId: string,
  ): Promise<ConfiguracionReportePersistida | null>;
  listarEjecuciones(
    configuracionId: string,
    limite?: number,
  ): Promise<EjecucionReportePersistida[]>;
  marcarEstadoPorRunQlik(
    runIdQlik: string,
    estado: "completada" | "error" | "detenida",
    finalizadoEn: Date,
  ): Promise<void>;
  actualizarConfiguracion(
    configuracionId: string,
    cambios: ActualizarConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida>;
  listarEjecucionesDescargas(
    contexto: { tenantQlikId: string; organizacionId: string },
    limite?: number,
  ): Promise<ResumenEjecucionDescarga[]>;
  obtenerEjecucionDescarga(
    contexto: { id: string; tenantQlikId: string; organizacionId: string },
  ): Promise<ResumenEjecucionDescarga | null>;
}

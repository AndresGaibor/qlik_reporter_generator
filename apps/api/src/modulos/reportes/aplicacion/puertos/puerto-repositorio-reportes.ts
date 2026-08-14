export type EstadoConfiguracionReporte =
  | "pendiente"
  | "creando"
  | "activa"
  | "error"
  | "desactivada"
  | "eliminada";

export interface NuevaProgramacionReportePersistida {
  expresionCron: string;
  zonaHoraria: string;
  proximaEjecucionEn: Date;
  activa: boolean;
}

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
  programar: boolean;
  programacion?: NuevaProgramacionReportePersistida;
  estado: EstadoConfiguracionReporte;
  claveIdempotencia?: string;
}

export interface ConfiguracionReportePersistida
  extends Omit<CrearConfiguracionReportePersistida, "programacion"> {
  id: string;
}

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
  tipoEjecucion: "manual" | "programada";
  estado: "preparando";
  versionCompilador: number;
}

export interface EjecucionReportePersistida
  extends CrearEjecucionReportePersistida {
  runIdQlik?: string | null;
  etapaError?: string | null;
  mensajeError?: string | null;
  iniciadoEn?: Date | null;
  finalizadoEn?: Date | null;
}

export interface ProgramacionReportePersistida {
  id: string;
  configuracionId: string;
  expresionCron: string;
  zonaHoraria: string;
  proximaEjecucionEn: Date;
  activa: boolean;
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
  listarProgramacionesVencidas(
    ahora: Date,
    limite?: number,
  ): Promise<ProgramacionReportePersistida[]>;
  intentarReclamarProgramacion(
    programacionId: string,
    proximaEsperada: Date,
    nuevaProxima: Date,
    ejecutadaEn: Date,
  ): Promise<boolean>;
}

export type EstadoReportePersistido =
  | "pendiente"
  | "creando"
  | "activa"
  | "error"
  | "desactivada"
  | "eliminada";

export interface CrearReportePersistido {
  organizacionId: string;
  tenantQlikId: string;
  creadoPorUsuarioId: string;
  nombre: string;
  flujoIdQlik: string;
  flujoNombreSnapshot: string;
  flujoEspacioIdQlik?: string;
  estado: EstadoReportePersistido;
}

export interface ReportePersistido extends CrearReportePersistido {
  id: string;
}

export interface ActualizarReportePersistido {
  nombre?: string;
  flujoIdQlik?: string;
  flujoNombreSnapshot?: string;
  flujoEspacioIdQlik?: string | null;
  estado?: EstadoReportePersistido;
}

export type EstadoEjecucionReportePersistida =
  | "preparando"
  | "iniciada"
  | "completada"
  | "error"
  | "detenida";

export interface CrearEjecucionReportePersistida {
  id: string;
  reporteId: string;
  ejecutadoPorUsuarioId?: string | null;
  automatizacionPersonalId?: string | null;
  flujoIdQlik: string;
  automatizacionIdQlik: string;
  hashDataflowSha256: string;
  scriptDataflow: string;
  sqlBigQueryCompilado: string;
  scriptExportacion: string;
  uriBaseGcs: string;
  estado: "preparando";
  versionCompilador: number;
}

export interface EjecucionReportePersistida
  extends Omit<CrearEjecucionReportePersistida, "estado"> {
  estado: EstadoEjecucionReportePersistida;
  ejecutadoPorUsuarioId?: string | null;
  automatizacionPersonalId?: string | null;
  runIdQlik?: string | null;
  etapaError?: string | null;
  mensajeError?: string | null;
  iniciadoEn?: Date | null;
  finalizadoEn?: Date | null;
  creadoEn?: Date;
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
  crearReporte(entrada: CrearReportePersistido): Promise<ReportePersistido>;
  obtenerPorId(
    reporteId: string,
    tenantQlikId: string,
    organizacionId: string,
  ): Promise<ReportePersistido | null>;
  listar(contexto: { tenantQlikId: string; organizacionId: string }): Promise<
    ReportePersistido[]
  >;
  actualizarReporte(
    id: string,
    cambios: ActualizarReportePersistido,
  ): Promise<ReportePersistido>;
  clonarReporte(id: string, nombre: string): Promise<ReportePersistido>;
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
    runIdQlik?: string,
  ): Promise<void>;
  marcarEjecucionCompletada(id: string, finalizadoEn: Date): Promise<void>;
  listarEjecuciones(
    reporteId: string,
    limite?: number,
  ): Promise<EjecucionReportePersistida[]>;
  marcarEstadoPorRunQlik(
    runIdQlik: string,
    estado: "completada" | "error" | "detenida",
    finalizadoEn: Date,
  ): Promise<void>;
  listarEjecucionesDescargas(
    contexto: { tenantQlikId: string; organizacionId: string },
    limite?: number,
  ): Promise<ResumenEjecucionDescarga[]>;
  obtenerEjecucionDescarga(contexto: {
    id: string;
    tenantQlikId: string;
    organizacionId: string;
  }): Promise<ResumenEjecucionDescarga | null>;
}

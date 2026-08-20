export type EstadoEjecucionReportePersistida =
  | "preparando"
  | "iniciada"
  | "completada"
  | "error"
  | "detenida";

export interface CrearEjecucionReportePersistida {
  id: string;
  organizacionId: string;
  tenantQlikId: string;
  ejecutadoPorUsuarioId?: string | null;
  automatizacionPersonalId?: string | null;
  flujoIdQlik: string;
  flujoNombreSnapshot: string;
  flujoEspacioIdQlik?: string | null;
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
  flujoIdQlik: string;
  flujoNombreSnapshot: string;
  creadoPorUsuarioId: string | null;
  propietarioCorreo?: string | null;
  automatizacionIdQlik: string;
  estado: string;
  mensajeError: string | null;
  uriBaseGcs: string;
  creadoEn: Date;
  finalizadoEn: Date | null;
}

export interface PuertoRepositorioReportes {
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
    flujoIdQlik: string,
    tenantQlikId: string,
    organizacionId: string,
    limite?: number,
  ): Promise<EjecucionReportePersistida[]>;
  listarUltimasEjecucionesPorFlujo(
    tenantQlikId: string,
    organizacionId: string,
  ): Promise<Array<{ flujoIdQlik: string; ultimaEjecucionEn: Date }>>;
  marcarEstadoEjecucion(
    id: string,
    estado: "completada" | "error" | "detenida",
    finalizadoEn: Date,
  ): Promise<void>;
  listarEjecucionesDescargas(
    contexto: {
      tenantQlikId: string;
      organizacionId: string;
      usuarioId?: string;
      esAdministrador?: boolean;
    },
    limite?: number,
  ): Promise<ResumenEjecucionDescarga[]>;
  obtenerEjecucionDescarga(contexto: {
    id: string;
    tenantQlikId: string;
    organizacionId: string;
    usuarioId?: string;
    esAdministrador?: boolean;
  }): Promise<ResumenEjecucionDescarga | null>;
}

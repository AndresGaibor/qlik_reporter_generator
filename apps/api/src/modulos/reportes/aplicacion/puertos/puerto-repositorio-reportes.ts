export type EstadoEjecucionReportePersistida =
  | "preparando"
  | "iniciada"
  | "completada"
  | "error"
  | "detenida"
  | "cancelando";

export type TipoJobBigQueryPersistido =
  | "principal"
  | "script"
  | "query"
  | "export"
  | "conteo"
  | "child"
  | "desconocido";

export type EstadoJobBigQueryPersistido =
  | "pendiente"
  | "running"
  | "done"
  | "error";

export interface JobBigQueryPersistido {
  id?: string;
  ejecucionReporteId: string;
  jobId: string;
  parentJobId: string | null;
  projectId: string;
  location: string;
  tipo: TipoJobBigQueryPersistido;
  estado: EstadoJobBigQueryPersistido;
  creationTime: string | null;
  startTime: string | null;
  endTime: string | null;
  duracionMs: number | null;
  totalBytesProcessed: string | null;
  totalBytesBilled: string | null;
  totalSlotMs: string | null;
  cacheHit: boolean | null;
  statementType: string | null;
  errorReason: string | null;
  errorMessage: string | null;
  metadataJson: Record<string, unknown> | null;
}

export interface CrearEjecucionReportePersistida {
  id: string;
  organizacionId: string;
  tenantQlikId: string;
  ejecutadoPorUsuarioId?: string | null;
  ejecutadoPorNombre?: string | null;
  ejecutadoPorCorreo?: string | null;
  origenEjecucion?: "manual" | "programada" | "api" | "legacy" | null;
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
  jobIdPrincipalBigQuery?: string | null;
  bigqueryProjectId?: string | null;
  bigqueryLocation?: string | null;
  estado: "preparando";
  versionCompilador: number;
}

export interface EjecucionReportePersistida
  extends Omit<CrearEjecucionReportePersistida, "estado"> {
  estado: EstadoEjecucionReportePersistida;
  ejecutadoPorUsuarioId?: string | null;
  ejecutadoPorNombre?: string | null;
  ejecutadoPorCorreo?: string | null;
  origenEjecucion?: "manual" | "programada" | "api" | "legacy" | null;
  automatizacionPersonalId?: string | null;
  runIdQlik?: string | null;
  etapaError?: string | null;
  mensajeError?: string | null;
  jobIdPrincipalBigQuery?: string | null;
  bigqueryProjectId?: string | null;
  bigqueryLocation?: string | null;
  qlikIniciadoEn?: Date | null;
  bigqueryIniciadoEn?: Date | null;
  bigqueryFinalizadoEn?: Date | null;
  gcsFinalizadoEn?: Date | null;
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
  iniciadoEn?: Date | null;
  finalizadoEn: Date | null;
  runIdQlik?: string | null;
  jobIdBigQuery?: string | null;
  bigqueryProjectId?: string | null;
  bigqueryLocation?: string | null;
  bigqueryIniciadoEn?: Date | null;
  bigqueryFinalizadoEn?: Date | null;
}

export interface PuertoRepositorioReportes {
  obtenerCompartidoReporte(contexto: {
    flujoIdQlik: string;
    organizacionId: string;
    tenantQlikId: string;
  }): Promise<{ todaOrganizacion: boolean; usuarios: string[] }>;
  listarReportesCompartidosParaUsuario(contexto: {
    organizacionId: string;
    tenantQlikId: string;
    usuarioId: string;
  }): Promise<Map<string, { directo: boolean; todaOrganizacion: boolean }>>;
  guardarCompartidoReporte(entrada: {
    flujoIdQlik: string;
    organizacionId: string;
    tenantQlikId: string;
    creadoPorUsuarioId: string;
    todaOrganizacion: boolean;
    usuarios: string[];
  }): Promise<void>;
  obtenerCompartidoDescarga(ejecucionId: string): Promise<{
    todaOrganizacion: boolean;
    usuarios: string[];
  }>;
  guardarCompartidoDescarga(entrada: {
    ejecucionId: string;
    organizacionId: string;
    creadoPorUsuarioId: string;
    todaOrganizacion: boolean;
    usuarios: string[];
  }): Promise<void>;
  crearEjecucion(
    entrada: CrearEjecucionReportePersistida,
  ): Promise<EjecucionReportePersistida>;
  tieneEjecucionesActivasPorAutomatizacion(
    automatizacionIdQlik: string,
  ): Promise<boolean>;
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
  marcarCancelacionSolicitada(
    ejecucionId: string,
    usuarioId: string,
    fecha: Date,
  ): Promise<void>;
  marcarEjecucionDetenida(ejecucionId: string, fecha: Date): Promise<void>;
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
  obtenerEjecucionPorJobId(
    jobId: string,
  ): Promise<EjecucionReportePersistida | null>;
  obtenerEjecucionPorId(id: string): Promise<EjecucionReportePersistida | null>;
  guardarJobBigQueryEjecucion(job: JobBigQueryPersistido): Promise<void>;
  listarJobsBigQueryPorEjecucion(
    ejecucionId: string,
  ): Promise<JobBigQueryPersistido[]>;
  listarJobsBigQueryPorEjecucionIds(
    ejecucionIds: string[],
  ): Promise<Map<string, JobBigQueryPersistido[]>>;
  actualizarTimestampsEjecucionBigQuery(
    ejecucionId: string,
    timestamps: {
      bigqueryIniciadoEn?: Date | null;
      bigqueryFinalizadoEn?: Date | null;
    },
  ): Promise<void>;
  marcarGcsFinalizada(id: string, gcsFinalizadoEn: Date): Promise<void>;
}

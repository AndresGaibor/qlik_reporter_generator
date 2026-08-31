import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const organizaciones = pgTable(
  "organizaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull().default("activa"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    ckEstado: check(
      "organizaciones_estado_check",
      sql`${t.estado} IN ('activa', 'suspendida')`,
    ),
  }),
);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    correo: text("correo"),
    avatarUrl: text("avatar_url"),
    estado: text("estado").notNull().default("activo"),
    esSuperadmin: boolean("es_superadmin").notNull().default(false),
    ultimoAccesoEn: timestamp("ultimo_acceso_en"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    ckEstado: check(
      "usuarios_estado_check",
      sql`${t.estado} IN ('activo', 'suspendido')`,
    ),
  }),
);

export const membresiasOrganizacion = pgTable(
  "membresias_organizacion",
  {
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    rol: text("rol").notNull().default("usuario"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => ({
    pk: unique("membresias_pk").on(t.organizacionId, t.usuarioId),
    ckRol: check("membresias_rol_check", sql`${t.rol} IN ('admin', 'usuario')`),
  }),
);

export const tenantsQlik = pgTable(
  "tenants_qlik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    tenantIdQlik: text("tenant_id_qlik").notNull(),
    host: text("host").notNull(),
    nombre: text("nombre"),
    estado: text("estado").notNull().default("activo"),
    esPrincipal: boolean("es_principal").notNull().default(false),
    automatizacionBaseIdQlik: text("automatizacion_base_id_qlik"),
    automatizacionBaseNombre: text("automatizacion_base_nombre"),
    dataflowBaseIdQlik: text("dataflow_base_id_qlik"),
    dataflowBaseNombre: text("dataflow_base_nombre"),
    dataflowPlantillas: jsonb("dataflow_plantillas")
      .$type<Array<{ id: string; nombre: string }>>()
      .notNull()
      .default([]),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqTenantId: unique("tenants_tenant_id_unique").on(t.tenantIdQlik),
    uqHost: unique("tenants_host_unique").on(t.host),
    uqPrincipalPorOrganizacion: uniqueIndex(
      "uq_tenant_principal_por_organizacion",
    )
      .on(t.organizacionId)
      .where(sql`${t.esPrincipal} = true`),
    ckEstado: check(
      "tenants_estado_check",
      sql`${t.estado} IN ('activo', 'desconectado', 'suspendido')`,
    ),
  }),
);

export const configuracionesOauthQlik = pgTable(
  "configuraciones_oauth_qlik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    clienteId: text("cliente_id").notNull(),
    clienteSecretoCifrado: text("cliente_secreto_cifrado").notNull(),
    secretoSufijo: text("secreto_sufijo").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    estado: text("estado").notNull().default("pendiente"),
    verificadaEn: timestamp("verificada_en"),
    ultimoError: text("ultimo_error"),
    creadoPorUsuarioId: uuid("creado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    actualizadoPorUsuarioId: uuid("actualizado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqTenant: uniqueIndex("uq_configuracion_oauth_por_tenant").on(
      t.tenantQlikId,
    ),
    ckEstado: check(
      "configuraciones_oauth_estado_check",
      sql`${t.estado} IN ('pendiente', 'verificada', 'error', 'desactivada')`,
    ),
  }),
);

export const identidadesQlik = pgTable(
  "identidades_qlik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    usuarioIdQlik: text("usuario_id_qlik").notNull(),
    sujetoQlik: text("sujeto_qlik"),
    nombreQlik: text("nombre_qlik"),
    correoQlik: text("correo_qlik"),
    avatarQlik: text("avatar_qlik"),
    estadoQlik: text("estado_qlik"),
    sincronizadoEn: timestamp("sincronizado_en").notNull().defaultNow(),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqIdentidad: unique("identidades_unique").on(
      t.tenantQlikId,
      t.usuarioIdQlik,
    ),
  }),
);

export const credencialesQlik = pgTable(
  "credenciales_qlik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identidadQlikId: uuid("identidad_qlik_id")
      .notNull()
      .unique()
      .references(() => identidadesQlik.id, { onDelete: "cascade" }),
    tokenAccesoCifrado: text("token_acceso_cifrado").notNull(),
    tokenRefrescoCifrado: text("token_refresco_cifrado"),
    scopes: text("scopes").array().notNull().default([]),
    tokenExpiraEn: timestamp("token_expira_en").notNull(),
    estado: text("estado").notNull().default("activa"),
    version: integer("version").notNull().default(1),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    ckEstado: check(
      "credenciales_estado_check",
      sql`${t.estado} IN ('activa', 'expirada', 'revocada', 'requiere_reconexion')`,
    ),
  }),
);

export const sesionesUsuario = pgTable(
  "sesiones_usuario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    identidadQlikId: uuid("identidad_qlik_id")
      .notNull()
      .references(() => identidadesQlik.id, { onDelete: "cascade" }),
    tenantQlikActivoId: uuid("tenant_qlik_activo_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    tokenSesionHash: text("token_sesion_hash").notNull().unique(),
    ipCreacion: text("ip_creacion"),
    agenteUsuario: text("agente_usuario"),
    expiraEn: timestamp("expira_en").notNull(),
    revocadaEn: timestamp("revocada_en"),
    creadaEn: timestamp("creada_en").notNull().defaultNow(),
  },
  (t) => ({
    idxUsuario: index("idx_sesiones_usuario_usuario").on(t.usuarioId),
    idxExpira: index("idx_sesiones_usuario_expira").on(t.expiraEn),
  }),
);

export const automatizacionesPersonalesQlik = pgTable(
  "automatizaciones_personales_qlik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    automatizacionIdQlik: text("automatizacion_id_qlik").notNull(),
    automatizacionNombreSnapshot: text(
      "automatizacion_nombre_snapshot",
    ).notNull(),
    estado: text("estado").notNull().default("activo"),
    mensajeError: text("mensaje_error"),
    contratoVersion: integer("contrato_version"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqUsuarioTenant: unique(
      "automatizaciones_personales_usuario_tenant_unique",
    ).on(t.usuarioId, t.tenantQlikId),
    idxTenant: index("idx_automatizaciones_personales_tenant").on(
      t.tenantQlikId,
    ),
    ckEstado: check(
      "automatizaciones_personales_estado_check",
      sql`${t.estado} IN ('activo', 'error', 'desactivado')`,
    ),
  }),
);

export const ejecucionesReportes = pgTable(
  "ejecuciones_reportes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id),
    ejecutadoPorUsuarioId: uuid("ejecutado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    ejecutadoPorNombre: text("ejecutado_por_nombre"),
    ejecutadoPorCorreo: text("ejecutado_por_correo"),
    origenEjecucion: text("origen_ejecucion"),
    automatizacionPersonalId: uuid("automatizacion_personal_id").references(
      () => automatizacionesPersonalesQlik.id,
      { onDelete: "set null" },
    ),
    flujoIdQlik: text("flujo_id_qlik").notNull(),
    flujoNombreSnapshot: text("flujo_nombre_snapshot").notNull(),
    flujoEspacioIdQlik: text("flujo_espacio_id_qlik"),
    automatizacionIdQlik: text("automatizacion_id_qlik").notNull(),
    runIdQlik: text("run_id_qlik"),
    hashDataflowSha256: text("hash_dataflow_sha256").notNull(),
    scriptDataflow: text("script_dataflow").notNull(),
    sqlBigQueryCompilado: text("sql_bigquery_compilado").notNull(),
    scriptExportacion: text("script_exportacion").notNull(),
    uriBaseGcs: text("uri_base_gcs").notNull(),
    estado: text("estado").notNull().default("preparando"),
    cancelacionSolicitadaEn: timestamp("cancelacion_solicitada_en"),
    canceladaPorUsuarioId: uuid("cancelada_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    motivoDetencion: text("motivo_detencion"),
    versionCompilador: integer("version_compilador").notNull().default(1),
    etapaError: text("etapa_error"),
    mensajeError: text("mensaje_error"),
    jobIdPrincipalBigQuery: text("job_id_principal_bigquery"),
    bigqueryProjectId: text("bigquery_project_id"),
    bigqueryLocation: text("bigquery_location"),
    qlikIniciadoEn: timestamp("qlik_iniciado_en"),
    bigqueryIniciadoEn: timestamp("bigquery_iniciado_en"),
    bigqueryFinalizadoEn: timestamp("bigquery_finalizado_en"),
    gcsFinalizadoEn: timestamp("gcs_finalizado_en"),
    filasExportadas: bigint("filas_exportadas", { mode: "bigint" }),
    fuenteFilasExportadas: text("fuente_filas_exportadas"),
    totalBytesProcessed: bigint("total_bytes_processed", { mode: "bigint" }),
    totalBytesBilled: bigint("total_bytes_billed", { mode: "bigint" }),
    totalSlotMs: bigint("total_slot_ms", { mode: "bigint" }),
    duracionBigQueryMs: bigint("duracion_bigquery_ms", { mode: "bigint" }),
    tarifaConsultaUsdPorTibAplicada: numeric(
      "tarifa_consulta_usd_por_tib_aplicada",
      { precision: 20, scale: 8 },
    ),
    costoBigqueryUsd: numeric("costo_bigquery_usd", {
      precision: 30,
      scale: 12,
    }),
    monedaCosto: text("moneda_costo"),
    versionFormulaCosto: integer("version_formula_costo"),
    metricasCalculadasEn: timestamp("metricas_calculadas_en"),
    iniciadoEn: timestamp("iniciado_en"),
    finalizadoEn: timestamp("finalizado_en"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxOrganizacionTenantFlujoFecha: index(
      "idx_ejecuciones_reportes_scope_fecha",
    ).on(t.organizacionId, t.tenantQlikId, t.flujoIdQlik, t.creadoEn),
    idxRunQlik: index("idx_ejecuciones_reportes_run_qlik").on(t.runIdQlik),
    idxEjecutorFecha: index("idx_ejecuciones_reportes_ejecutor_fecha").on(
      t.ejecutadoPorUsuarioId,
      t.creadoEn,
    ),
    ckEstado: check(
      "ejecuciones_reportes_estado_check",
      sql`${t.estado} IN ('preparando', 'iniciada', 'completada', 'error', 'detenida', 'cancelando')`,
    ),
    ckFuenteFilasExportadas: check(
      "ejecuciones_reportes_fuente_filas_check",
      sql`${t.fuenteFilasExportadas} IS NULL OR ${t.fuenteFilasExportadas} IN ('pipeline', 'procesamiento_resultado', 'legacy')`,
    ),
    ckMetricasNoNegativas: check(
      "ejecuciones_reportes_metricas_check",
      sql`${t.filasExportadas} IS NULL OR ${t.filasExportadas} >= 0`,
    ),
    ckMonedaCosto: check(
      "ejecuciones_reportes_moneda_costo_check",
      sql`${t.monedaCosto} IS NULL OR ${t.monedaCosto} = 'USD'`,
    ),
    ckVersionFormulaCosto: check(
      "ejecuciones_reportes_version_formula_costo_check",
      sql`${t.versionFormulaCosto} IS NULL OR ${t.versionFormulaCosto} >= 1`,
    ),
  }),
);

export const resultadosEjecucionesReportes = pgTable(
  "resultados_ejecuciones_reportes",
  {
    ejecucionReporteId: uuid("ejecucion_reporte_id")
      .primaryKey()
      .references(() => ejecucionesReportes.id, { onDelete: "cascade" }),
    estado: text("estado").notNull().default("pendiente"),
    tamanoAlmacenadoBytes: bigint("tamano_almacenado_bytes", {
      mode: "bigint",
    }),
    objetosFuente: bigint("objetos_fuente", { mode: "bigint" }),
    partesDescarga: integer("partes_descarga"),
    maximoFilasPorArchivoAplicado: bigint("maximo_filas_por_archivo_aplicado", {
      mode: "bigint",
    }),
    disponibleEn: timestamp("disponible_en"),
    eliminadoEn: timestamp("eliminado_en"),
    eliminadoPorUsuarioId: uuid("eliminado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    motivoEliminacion: text("motivo_eliminacion"),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    ckEstado: check(
      "resultados_ejecuciones_reportes_estado_check",
      sql`${t.estado} IN ('pendiente', 'disponible', 'sin_archivos', 'eliminado', 'error_parcial')`,
    ),
    ckMetricasNoNegativas: check(
      "resultados_ejecuciones_reportes_metricas_check",
      sql`${t.tamanoAlmacenadoBytes} IS NULL OR ${t.tamanoAlmacenadoBytes} >= 0`,
    ),
  }),
);

export const descargasCompartidas = pgTable(
  "descargas_compartidas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ejecucionReporteId: uuid("ejecucion_reporte_id")
      .notNull()
      .references(() => ejecucionesReportes.id, { onDelete: "cascade" }),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, {
      onDelete: "cascade",
    }),
    alcance: text("alcance").notNull(),
    creadoPorUsuarioId: uuid("creado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxEjecucion: index("idx_descargas_compartidas_ejecucion").on(
      t.ejecucionReporteId,
    ),
    ckAlcance: check(
      "descargas_compartidas_alcance_check",
      sql`${t.alcance} IN ('usuario', 'organizacion')`,
    ),
    ckDestinatario: check(
      "descargas_compartidas_destinatario_check",
      sql`(${t.alcance} = 'usuario' AND ${t.usuarioId} IS NOT NULL) OR (${t.alcance} = 'organizacion' AND ${t.usuarioId} IS NULL)`,
    ),
  }),
);

export const reportesCompartidos = pgTable(
  "reportes_compartidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    flujoIdQlik: text("flujo_id_qlik").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, {
      onDelete: "cascade",
    }),
    alcance: text("alcance").notNull(),
    creadoPorUsuarioId: uuid("creado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxFlujo: index("idx_reportes_compartidos_flujo").on(
      t.organizacionId,
      t.tenantQlikId,
      t.flujoIdQlik,
    ),
    ckAlcance: check(
      "reportes_compartidos_alcance_check",
      sql`${t.alcance} IN ('usuario', 'organizacion')`,
    ),
    ckDestinatario: check(
      "reportes_compartidos_destinatario_check",
      sql`(${t.alcance} = 'usuario' AND ${t.usuarioId} IS NOT NULL) OR (${t.alcance} = 'organizacion' AND ${t.usuarioId} IS NULL)`,
    ),
  }),
);

export const auditoriaEventos = pgTable(
  "auditoria_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id").references(
      () => organizaciones.id,
      { onDelete: "set null" },
    ),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    accion: text("accion").notNull(),
    entidadTipo: text("entidad_tipo"),
    entidadId: text("entidad_id"),
    resultado: text("resultado").notNull(),
    datosAnteriores: jsonb("datos_anteriores"),
    datosNuevos: jsonb("datos_nuevos"),
    codigoError: text("codigo_error"),
    mensajeError: text("mensaje_error"),
    ip: text("ip"),
    agenteUsuario: text("agente_usuario"),
    idSolicitud: text("id_solicitud"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxOrgFecha: index("idx_auditoria_org_fecha").on(
      t.organizacionId,
      t.creadoEn,
    ),
    idxUsuarioFecha: index("idx_auditoria_usuario_fecha").on(
      t.usuarioId,
      t.creadoEn,
    ),
    ckResultado: check(
      "auditoria_resultado_check",
      sql`${t.resultado} IN ('exito', 'error', 'denegado')`,
    ),
  }),
);

export const appConfig = pgTable("app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: text("clave").notNull().unique(),
  valor: jsonb("valor").notNull(),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

export const solicitudesIdempotentes = pgTable(
  "solicitudes_idempotentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    alcance: text("alcance").notNull(),
    clave: text("clave").notNull(),
    hashSolicitud: text("hash_solicitud").notNull(),
    estado: text("estado").notNull().default("procesando"),
    estadoHttp: integer("estado_http"),
    respuesta: jsonb("respuesta"),
    expiraEn: timestamp("expira_en").notNull(),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqClave: unique("solicitudes_idempotentes_unique").on(
      t.organizacionId,
      t.alcance,
      t.clave,
    ),
    idxExpira: index("idx_solicitudes_idempotentes_expira").on(t.expiraEn),
    ckEstado: check(
      "solicitudes_idempotentes_estado_check",
      sql`${t.estado} IN ('procesando', 'completada', 'fallida')`,
    ),
  }),
);

export const conexionesDestino = pgTable(
  "conexiones_destino",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    tenantQlikId: uuid("tenant_qlik_id").references(() => tenantsQlik.id, {
      onDelete: "set null",
    }),
    tipo: text("tipo").notNull(),
    nombre: text("nombre").notNull(),
    config: jsonb("config").notNull().default({}),
    secretoRefs: jsonb("secreto_refs").notNull().default({}),
    estado: text("estado").notNull().default("activo"),
    esPredeterminada: boolean("es_predeterminada").notNull().default(false),
    mensajeError: text("mensaje_error"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqNombrePorOrg: unique("uq_conexion_por_org_nombre").on(
      t.organizacionId,
      t.tipo,
      t.nombre,
    ),
    idxTipo: index("idx_conexiones_tipo").on(t.tipo),
    idxEstado: index("idx_conexiones_estado").on(t.estado),
    idxTenant: index("idx_conexiones_tenant")
      .on(t.tenantQlikId)
      .where(sql`${t.tenantQlikId} IS NOT NULL`),
    uqPredeterminadaPorTenant: uniqueIndex(
      "uq_conexion_bigquery_predeterminada_tenant",
    )
      .on(t.tenantQlikId, t.tipo)
      .where(
        sql`${t.esPredeterminada} = true AND ${t.tenantQlikId} IS NOT NULL`,
      ),
    ckTipo: check("conexiones_destino_tipo_check", sql`${t.tipo} = 'bigquery'`),
    ckEstado: check(
      "conexiones_destino_estado_check",
      sql`${t.estado} IN ('activo', 'error', 'desconectado')`,
    ),
  }),
);

export const jobsBigQueryEjecucion = pgTable(
  "jobs_bigquery_ejecucion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ejecucionReporteId: uuid("ejecucion_reporte_id")
      .notNull()
      .references(() => ejecucionesReportes.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    parentJobId: text("parent_job_id"),
    projectId: text("project_id").notNull(),
    location: text("location").default("US"),
    tipo: text("tipo").notNull(),
    estado: text("estado").notNull(),
    creationTime: timestamp("creation_time"),
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    duracionMs: integer("duracion_ms"),
    totalBytesProcessed: text("total_bytes_processed"),
    totalBytesBilled: text("total_bytes_billed"),
    totalSlotMs: text("total_slot_ms"),
    cacheHit: boolean("cache_hit"),
    statementType: text("statement_type"),
    errorReason: text("error_reason"),
    errorMessage: text("error_message"),
    metadataJson: jsonb("metadata_json"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    uqJobProjectLocation: unique("uq_job_project_location").on(
      t.projectId,
      t.location,
      t.jobId,
    ),
    idxEjecucion: index("idx_jobs_ejecucion_reportes").on(t.ejecucionReporteId),
    idxJobId: index("idx_jobs_job_id").on(t.jobId),
    idxEstado: index("idx_jobs_estado").on(t.estado),
    ckTipo: check(
      "jobs_bigquery_tipo_check",
      sql`${t.tipo} IN ('principal', 'script', 'query', 'export', 'conteo', 'child', 'desconocido')`,
    ),
    ckEstado: check(
      "jobs_bigquery_estado_check",
      sql`${t.estado} IN ('pendiente', 'running', 'done', 'error')`,
    ),
  }),
);

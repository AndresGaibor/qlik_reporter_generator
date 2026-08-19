import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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

export const reportes = pgTable(
  "reportes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizacionId: uuid("organizacion_id")
      .notNull()
      .references(() => organizaciones.id, { onDelete: "cascade" }),
    tenantQlikId: uuid("tenant_qlik_id")
      .notNull()
      .references(() => tenantsQlik.id, { onDelete: "cascade" }),
    creadoPorUsuarioId: uuid("creado_por_usuario_id")
      .notNull()
      .references(() => usuarios.id),
    nombre: text("nombre").notNull(),
    flujoIdQlik: text("flujo_id_qlik").notNull(),
    flujoNombreSnapshot: text("flujo_nombre_snapshot").notNull(),
    flujoEspacioIdQlik: text("flujo_espacio_id_qlik"),
    estado: text("estado").notNull().default("pendiente"),
    mensajeError: text("mensaje_error"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("idx_reportes_tenant").on(t.tenantQlikId),
    idxFlujo: index("idx_reportes_flujo").on(t.tenantQlikId, t.flujoIdQlik),
    ckEstado: check(
      "configuraciones_estado_check",
      sql`${t.estado} IN ('pendiente', 'creando', 'activa', 'error', 'desactivada', 'eliminada')`,
    ),
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
    reporteId: uuid("reporte_id")
      .notNull()
      .references(() => reportes.id, {
        onDelete: "cascade",
      }),
    ejecutadoPorUsuarioId: uuid("ejecutado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    automatizacionPersonalId: uuid("automatizacion_personal_id").references(
      () => automatizacionesPersonalesQlik.id,
      { onDelete: "set null" },
    ),
    flujoIdQlik: text("flujo_id_qlik").notNull(),
    automatizacionIdQlik: text("automatizacion_id_qlik").notNull(),
    runIdQlik: text("run_id_qlik"),
    hashDataflowSha256: text("hash_dataflow_sha256").notNull(),
    scriptDataflow: text("script_dataflow").notNull(),
    sqlBigQueryCompilado: text("sql_bigquery_compilado").notNull(),
    scriptExportacion: text("script_exportacion").notNull(),
    uriBaseGcs: text("uri_base_gcs").notNull(),
    estado: text("estado").notNull().default("preparando"),
    versionCompilador: integer("version_compilador").notNull().default(1),
    etapaError: text("etapa_error"),
    mensajeError: text("mensaje_error"),
    iniciadoEn: timestamp("iniciado_en"),
    finalizadoEn: timestamp("finalizado_en"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => ({
    idxReporteFecha: index("idx_ejecuciones_reportes_reporte_fecha").on(
      t.reporteId,
      t.creadoEn,
    ),
    idxRunQlik: index("idx_ejecuciones_reportes_run_qlik").on(t.runIdQlik),
    ckEstado: check(
      "ejecuciones_reportes_estado_check",
      sql`${t.estado} IN ('preparando', 'iniciada', 'completada', 'error', 'detenida')`,
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

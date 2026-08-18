CREATE TABLE IF NOT EXISTS "app_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_config_clave_unique" UNIQUE("clave")
);

CREATE TABLE IF NOT EXISTS "auditoria_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"entidad_tipo" text,
	"entidad_id" text,
	"resultado" text NOT NULL,
	"datos_anteriores" jsonb,
	"datos_nuevos" jsonb,
	"codigo_error" text,
	"mensaje_error" text,
	"ip" text,
	"agente_usuario" text,
	"id_solicitud" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_resultado_check" CHECK ("auditoria_eventos"."resultado" IN ('exito', 'error', 'denegado'))
);

CREATE TABLE IF NOT EXISTS "automatizaciones_qlik_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"automatizacion_id_qlik" text NOT NULL,
	"espacio_id_qlik" text,
	"propietario_id_qlik" text,
	"nombre" text NOT NULL,
	"estado" text,
	"modo_ejecucion" text,
	"ultimo_estado_ejecucion" text,
	"ultima_ejecucion_en" timestamp,
	"creada_en_qlik" timestamp,
	"modificada_en_qlik" timestamp,
	"metadatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sincronizado_en" timestamp DEFAULT now() NOT NULL,
	"eliminado_en" timestamp,
	CONSTRAINT "automatizaciones_unique" UNIQUE("tenant_qlik_id","automatizacion_id_qlik")
);

CREATE TABLE IF NOT EXISTS "conexiones_destino" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"tenant_qlik_id" uuid,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secreto_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"es_predeterminada" boolean DEFAULT false NOT NULL,
	"mensaje_error" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_conexion_por_org_nombre" UNIQUE("organizacion_id","tipo","nombre"),
	CONSTRAINT "conexiones_destino_tipo_check" CHECK ("conexiones_destino"."tipo" = 'bigquery'),
	CONSTRAINT "conexiones_destino_estado_check" CHECK ("conexiones_destino"."estado" IN ('activo', 'error', 'desconectado'))
);

CREATE TABLE IF NOT EXISTS "configuraciones_automatizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"creado_por_usuario_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"flujo_id_qlik" text NOT NULL,
	"flujo_nombre_snapshot" text NOT NULL,
	"flujo_espacio_id_qlik" text,
	"destino_proveedor" text NOT NULL,
	"destino_id_externo" text NOT NULL,
	"destino_nombre_snapshot" text NOT NULL,
	"automatizacion_id_qlik" text,
	"automatizacion_nombre_snapshot" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"mensaje_error" text,
	"clave_idempotencia" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "configuraciones_automatizacion_clave_idempotencia_unique" UNIQUE("clave_idempotencia"),
	CONSTRAINT "configuraciones_estado_check" CHECK ("configuraciones_automatizacion"."estado" IN ('pendiente', 'creando', 'activa', 'error', 'desactivada', 'eliminada'))
);

CREATE TABLE IF NOT EXISTS "configuraciones_oauth_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"cliente_id" text NOT NULL,
	"cliente_secreto_cifrado" text NOT NULL,
	"secreto_sufijo" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"verificada_en" timestamp,
	"ultimo_error" text,
	"creado_por_usuario_id" uuid,
	"actualizado_por_usuario_id" uuid,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "configuraciones_oauth_estado_check" CHECK ("configuraciones_oauth_qlik"."estado" IN ('pendiente', 'verificada', 'error', 'desactivada'))
);

CREATE TABLE IF NOT EXISTS "credenciales_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identidad_qlik_id" uuid NOT NULL,
	"token_acceso_cifrado" text NOT NULL,
	"token_refresco_cifrado" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"token_expira_en" timestamp NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credenciales_qlik_identidad_qlik_id_unique" UNIQUE("identidad_qlik_id"),
	CONSTRAINT "credenciales_estado_check" CHECK ("credenciales_qlik"."estado" IN ('activa', 'expirada', 'revocada', 'requiere_reconexion'))
);

CREATE TABLE IF NOT EXISTS "ejecuciones_reportes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuracion_id" uuid NOT NULL,
	"flujo_id_qlik" text NOT NULL,
	"automatizacion_id_qlik" text NOT NULL,
	"run_id_qlik" text,
	"hash_dataflow_sha256" text NOT NULL,
	"script_dataflow" text NOT NULL,
	"sql_bigquery_compilado" text NOT NULL,
	"script_exportacion" text NOT NULL,
	"uri_base_gcs" text NOT NULL,
	"tipo_ejecucion" text NOT NULL,
	"estado" text DEFAULT 'preparando' NOT NULL,
	"version_compilador" integer DEFAULT 1 NOT NULL,
	"etapa_error" text,
	"mensaje_error" text,
	"iniciado_en" timestamp,
	"finalizado_en" timestamp,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ejecuciones_reportes_tipo_check" CHECK ("ejecuciones_reportes"."tipo_ejecucion" = 'manual'),
	CONSTRAINT "ejecuciones_reportes_estado_check" CHECK ("ejecuciones_reportes"."estado" IN ('preparando', 'iniciada', 'completada', 'error', 'detenida'))
);

CREATE TABLE IF NOT EXISTS "espacios_qlik_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"espacio_id_qlik" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text,
	"propietario_id_qlik" text,
	"metadatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modificado_en_qlik" timestamp,
	"sincronizado_en" timestamp DEFAULT now() NOT NULL,
	"eliminado_en" timestamp,
	CONSTRAINT "espacios_unique" UNIQUE("tenant_qlik_id","espacio_id_qlik")
);

CREATE TABLE IF NOT EXISTS "eventos_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agregado_tipo" text NOT NULL,
	"agregado_id" text NOT NULL,
	"tipo" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"datos" jsonb NOT NULL,
	"metadatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocurrido_en" timestamp NOT NULL,
	"publicado_en" timestamp,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ultimo_error" text,
	"creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flujos_qlik_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"flujo_id_qlik" text NOT NULL,
	"espacio_id_qlik" text,
	"nombre" text NOT NULL,
	"propietario_id_qlik" text,
	"url_qlik" text,
	"tipo_recurso" text,
	"metadatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modificado_en_qlik" timestamp,
	"sincronizado_en" timestamp DEFAULT now() NOT NULL,
	"eliminado_en" timestamp,
	CONSTRAINT "flujos_unique" UNIQUE("tenant_qlik_id","flujo_id_qlik")
);

CREATE TABLE IF NOT EXISTS "identidades_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"usuario_id_qlik" text NOT NULL,
	"sujeto_qlik" text,
	"nombre_qlik" text,
	"correo_qlik" text,
	"avatar_qlik" text,
	"estado_qlik" text,
	"sincronizado_en" timestamp DEFAULT now() NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "identidades_unique" UNIQUE("tenant_qlik_id","usuario_id_qlik")
);

CREATE TABLE IF NOT EXISTS "intentos_oauth_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_tenant" text NOT NULL,
	"hash_estado" text NOT NULL,
	"verificador_pkce_cifrado" text NOT NULL,
	"ruta_retorno" text DEFAULT '/' NOT NULL,
	"expira_en" timestamp NOT NULL,
	"consumido_en" timestamp,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intentos_oauth_qlik_hash_estado_unique" UNIQUE("hash_estado")
);

CREATE TABLE IF NOT EXISTS "membresias_organizacion" (
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol" text DEFAULT 'usuario' NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "membresias_pk" UNIQUE("organizacion_id","usuario_id"),
	CONSTRAINT "membresias_rol_check" CHECK ("membresias_organizacion"."rol" IN ('administrador', 'editor', 'usuario', 'auditor', 'admin'))
);

CREATE TABLE IF NOT EXISTS "organizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizaciones_estado_check" CHECK ("organizaciones"."estado" IN ('activa', 'suspendida'))
);

CREATE TABLE IF NOT EXISTS "sesiones_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"identidad_qlik_id" uuid NOT NULL,
	"tenant_qlik_activo_id" uuid NOT NULL,
	"token_sesion_hash" text NOT NULL,
	"ip_creacion" text,
	"agente_usuario" text,
	"expira_en" timestamp NOT NULL,
	"revocada_en" timestamp,
	"creada_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sesiones_usuario_token_sesion_hash_unique" UNIQUE("token_sesion_hash")
);

CREATE TABLE IF NOT EXISTS "solicitudes_idempotentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"alcance" text NOT NULL,
	"clave" text NOT NULL,
	"hash_solicitud" text NOT NULL,
	"estado" text DEFAULT 'procesando' NOT NULL,
	"estado_http" integer,
	"respuesta" jsonb,
	"expira_en" timestamp NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_idempotentes_unique" UNIQUE("organizacion_id","alcance","clave"),
	CONSTRAINT "solicitudes_idempotentes_estado_check" CHECK ("solicitudes_idempotentes"."estado" IN ('procesando', 'completada', 'fallida'))
);

CREATE TABLE IF NOT EXISTS "tenants_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"tenant_id_qlik" text NOT NULL,
	"host" text NOT NULL,
	"nombre" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"es_principal" boolean DEFAULT false NOT NULL,
	"automatizacion_base_id_qlik" text,
	"automatizacion_base_nombre" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_tenant_id_unique" UNIQUE("tenant_id_qlik"),
	CONSTRAINT "tenants_host_unique" UNIQUE("host"),
	CONSTRAINT "tenants_estado_check" CHECK ("tenants_qlik"."estado" IN ('activo', 'desconectado', 'suspendido'))
);

CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"correo" text,
	"avatar_url" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"es_superadmin" boolean DEFAULT false NOT NULL,
	"ultimo_acceso_en" timestamp,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_estado_check" CHECK ("usuarios"."estado" IN ('activo', 'suspendido'))
);

ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "automatizaciones_qlik_cache" ADD CONSTRAINT "automatizaciones_qlik_cache_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conexiones_destino" ADD CONSTRAINT "conexiones_destino_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conexiones_destino" ADD CONSTRAINT "conexiones_destino_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "configuraciones_automatizacion" ADD CONSTRAINT "configuraciones_automatizacion_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "configuraciones_automatizacion" ADD CONSTRAINT "configuraciones_automatizacion_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "configuraciones_automatizacion" ADD CONSTRAINT "configuraciones_automatizacion_creado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "configuraciones_oauth_qlik" ADD CONSTRAINT "configuraciones_oauth_qlik_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "configuraciones_oauth_qlik" ADD CONSTRAINT "configuraciones_oauth_qlik_creado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "configuraciones_oauth_qlik" ADD CONSTRAINT "configuraciones_oauth_qlik_actualizado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("actualizado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "credenciales_qlik" ADD CONSTRAINT "credenciales_qlik_identidad_qlik_id_identidades_qlik_id_fk" FOREIGN KEY ("identidad_qlik_id") REFERENCES "public"."identidades_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_configuracion_id_configuraciones_automatizacion_id_fk" FOREIGN KEY ("configuracion_id") REFERENCES "public"."configuraciones_automatizacion"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "espacios_qlik_cache" ADD CONSTRAINT "espacios_qlik_cache_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "flujos_qlik_cache" ADD CONSTRAINT "flujos_qlik_cache_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "identidades_qlik" ADD CONSTRAINT "identidades_qlik_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "identidades_qlik" ADD CONSTRAINT "identidades_qlik_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membresias_organizacion" ADD CONSTRAINT "membresias_organizacion_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membresias_organizacion" ADD CONSTRAINT "membresias_organizacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sesiones_usuario" ADD CONSTRAINT "sesiones_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sesiones_usuario" ADD CONSTRAINT "sesiones_usuario_identidad_qlik_id_identidades_qlik_id_fk" FOREIGN KEY ("identidad_qlik_id") REFERENCES "public"."identidades_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sesiones_usuario" ADD CONSTRAINT "sesiones_usuario_tenant_qlik_activo_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_activo_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "solicitudes_idempotentes" ADD CONSTRAINT "solicitudes_idempotentes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tenants_qlik" ADD CONSTRAINT "tenants_qlik_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_auditoria_org_fecha" ON "auditoria_eventos" USING btree ("organizacion_id","creado_en");
CREATE INDEX "idx_auditoria_usuario_fecha" ON "auditoria_eventos" USING btree ("usuario_id","creado_en");
CREATE INDEX "idx_conexiones_tipo" ON "conexiones_destino" USING btree ("tipo");
CREATE INDEX "idx_conexiones_estado" ON "conexiones_destino" USING btree ("estado");
CREATE INDEX "idx_conexiones_tenant" ON "conexiones_destino" USING btree ("tenant_qlik_id") WHERE "conexiones_destino"."tenant_qlik_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_conexion_bigquery_predeterminada_tenant" ON "conexiones_destino" USING btree ("tenant_qlik_id","tipo") WHERE "conexiones_destino"."es_predeterminada" = true AND "conexiones_destino"."tenant_qlik_id" IS NOT NULL;
CREATE INDEX "idx_configuraciones_tenant" ON "configuraciones_automatizacion" USING btree ("tenant_qlik_id");
CREATE INDEX "idx_configuraciones_flujo" ON "configuraciones_automatizacion" USING btree ("tenant_qlik_id","flujo_id_qlik");
CREATE INDEX "idx_configuraciones_automatizacion" ON "configuraciones_automatizacion" USING btree ("tenant_qlik_id","automatizacion_id_qlik");
CREATE UNIQUE INDEX "uq_configuracion_oauth_por_tenant" ON "configuraciones_oauth_qlik" USING btree ("tenant_qlik_id");
CREATE INDEX "idx_ejecuciones_reportes_config_fecha" ON "ejecuciones_reportes" USING btree ("configuracion_id","creado_en");
CREATE INDEX "idx_ejecuciones_reportes_run_qlik" ON "ejecuciones_reportes" USING btree ("run_id_qlik");
CREATE INDEX "idx_eventos_outbox_pendientes" ON "eventos_outbox" USING btree ("publicado_en","ocurrido_en");
CREATE INDEX "idx_eventos_outbox_agregado" ON "eventos_outbox" USING btree ("agregado_tipo","agregado_id");
CREATE INDEX "idx_intentos_oauth_expira" ON "intentos_oauth_qlik" USING btree ("expira_en");
CREATE INDEX "idx_sesiones_usuario_usuario" ON "sesiones_usuario" USING btree ("usuario_id");
CREATE INDEX "idx_sesiones_usuario_expira" ON "sesiones_usuario" USING btree ("expira_en");
CREATE INDEX "idx_solicitudes_idempotentes_expira" ON "solicitudes_idempotentes" USING btree ("expira_en");
CREATE UNIQUE INDEX "uq_tenant_principal_por_organizacion" ON "tenants_qlik" USING btree ("organizacion_id") WHERE "tenants_qlik"."es_principal" = true;

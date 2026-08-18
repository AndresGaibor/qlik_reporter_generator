CREATE TABLE "automatizaciones_personales_qlik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"tenant_qlik_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"automatizacion_id_qlik" text NOT NULL,
	"automatizacion_nombre_snapshot" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"mensaje_error" text,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "automatizaciones_personales_usuario_tenant_unique" UNIQUE("usuario_id","tenant_qlik_id"),
	CONSTRAINT "automatizaciones_personales_estado_check" CHECK ("automatizaciones_personales_qlik"."estado" IN ('activo', 'error', 'desactivado'))
);
--> statement-breakpoint
ALTER TABLE "configuraciones_automatizacion" RENAME TO "reportes";--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" RENAME COLUMN "configuracion_id" TO "reporte_id";--> statement-breakpoint
ALTER TABLE "reportes" DROP CONSTRAINT "configuraciones_estado_check";--> statement-breakpoint
ALTER TABLE "reportes" DROP CONSTRAINT "configuraciones_automatizacion_organizacion_id_organizaciones_id_fk";
--> statement-breakpoint
ALTER TABLE "reportes" DROP CONSTRAINT "configuraciones_automatizacion_tenant_qlik_id_tenants_qlik_id_fk";
--> statement-breakpoint
ALTER TABLE "reportes" DROP CONSTRAINT "configuraciones_automatizacion_creado_por_usuario_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP CONSTRAINT "ejecuciones_reportes_configuracion_id_configuraciones_automatizacion_id_fk";
--> statement-breakpoint
DROP INDEX "idx_configuraciones_tenant";--> statement-breakpoint
DROP INDEX "idx_configuraciones_flujo";--> statement-breakpoint
DROP INDEX "idx_configuraciones_automatizacion";--> statement-breakpoint
DROP INDEX "idx_ejecuciones_reportes_config_fecha";--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "ejecutado_por_usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "automatizacion_personal_id" uuid;--> statement-breakpoint
ALTER TABLE "automatizaciones_personales_qlik" ADD CONSTRAINT "automatizaciones_personales_qlik_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automatizaciones_personales_qlik" ADD CONSTRAINT "automatizaciones_personales_qlik_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automatizaciones_personales_qlik" ADD CONSTRAINT "automatizaciones_personales_qlik_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_automatizaciones_personales_tenant" ON "automatizaciones_personales_qlik" USING btree ("tenant_qlik_id");--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_creado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_reporte_id_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."reportes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_ejecutado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("ejecutado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_automatizacion_personal_id_automatizaciones_personales_qlik_id_fk" FOREIGN KEY ("automatizacion_personal_id") REFERENCES "public"."automatizaciones_personales_qlik"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reportes_tenant" ON "reportes" USING btree ("tenant_qlik_id");--> statement-breakpoint
CREATE INDEX "idx_reportes_flujo" ON "reportes" USING btree ("tenant_qlik_id","flujo_id_qlik");--> statement-breakpoint
CREATE INDEX "idx_ejecuciones_reportes_reporte_fecha" ON "ejecuciones_reportes" USING btree ("reporte_id","creado_en");--> statement-breakpoint
ALTER TABLE "reportes" DROP COLUMN "automatizacion_id_qlik";--> statement-breakpoint
ALTER TABLE "reportes" DROP COLUMN "automatizacion_nombre_snapshot";--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "configuraciones_estado_check" CHECK ("reportes"."estado" IN ('pendiente', 'creando', 'activa', 'error', 'desactivada', 'eliminada'));
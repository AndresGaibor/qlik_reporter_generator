-- Reconciliación idempotente de las migraciones de compartir de Joseph.
-- 0011 y 0012 conservan timestamps anteriores a 0010 y algunas bases que ya
-- habían aplicado 0010 podían omitirlas al comparar el último `created_at`.

CREATE TABLE IF NOT EXISTS "descargas_compartidas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ejecucion_reporte_id" uuid NOT NULL REFERENCES "ejecuciones_reportes"("id") ON DELETE CASCADE,
  "organizacion_id" uuid NOT NULL REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  "usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "alcance" text NOT NULL,
  "creado_por_usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "descargas_compartidas_alcance_check" CHECK ("alcance" IN ('usuario', 'organizacion')),
  CONSTRAINT "descargas_compartidas_destinatario_check" CHECK (("alcance" = 'usuario' AND "usuario_id" IS NOT NULL) OR ("alcance" = 'organizacion' AND "usuario_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_descargas_compartidas_ejecucion" ON "descargas_compartidas" ("ejecucion_reporte_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_descarga_compartida_usuario" ON "descargas_compartidas" ("ejecucion_reporte_id", "usuario_id") WHERE "usuario_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_descarga_compartida_organizacion" ON "descargas_compartidas" ("ejecucion_reporte_id") WHERE "alcance" = 'organizacion';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reportes_compartidos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizacion_id" uuid NOT NULL REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  "tenant_qlik_id" uuid NOT NULL REFERENCES "tenants_qlik"("id") ON DELETE CASCADE,
  "flujo_id_qlik" text NOT NULL,
  "usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "alcance" text NOT NULL,
  "creado_por_usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "reportes_compartidos_alcance_check" CHECK ("alcance" IN ('usuario', 'organizacion')),
  CONSTRAINT "reportes_compartidos_destinatario_check" CHECK (("alcance" = 'usuario' AND "usuario_id" IS NOT NULL) OR ("alcance" = 'organizacion' AND "usuario_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reportes_compartidos_flujo" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reporte_compartido_usuario" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik", "usuario_id") WHERE "usuario_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reporte_compartido_organizacion" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik") WHERE "alcance" = 'organizacion';

CREATE TABLE "reportes_compartidos" (
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
CREATE INDEX "idx_reportes_compartidos_flujo" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik");
CREATE UNIQUE INDEX "uq_reporte_compartido_usuario" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik", "usuario_id") WHERE "usuario_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_reporte_compartido_organizacion" ON "reportes_compartidos" ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik") WHERE "alcance" = 'organizacion';

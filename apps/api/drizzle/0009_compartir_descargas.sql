CREATE TABLE "descargas_compartidas" (
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
CREATE INDEX "idx_descargas_compartidas_ejecucion" ON "descargas_compartidas" ("ejecucion_reporte_id");
CREATE UNIQUE INDEX "uq_descarga_compartida_usuario" ON "descargas_compartidas" ("ejecucion_reporte_id", "usuario_id") WHERE "usuario_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_descarga_compartida_organizacion" ON "descargas_compartidas" ("ejecucion_reporte_id") WHERE "alcance" = 'organizacion';

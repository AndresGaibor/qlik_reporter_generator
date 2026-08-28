ALTER TABLE "ejecuciones_reportes"
  ADD COLUMN "cancelacion_solicitada_en" timestamp,
  ADD COLUMN "cancelada_por_usuario_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  ADD COLUMN "motivo_detencion" text;

ALTER TABLE "ejecuciones_reportes"
  DROP CONSTRAINT IF EXISTS "ejecuciones_reportes_estado_check";

ALTER TABLE "ejecuciones_reportes"
  ADD CONSTRAINT "ejecuciones_reportes_estado_check"
  CHECK ("estado" IN ('preparando', 'iniciada', 'completada', 'error', 'detenida', 'cancelando'));

ALTER TABLE "ejecuciones_reportes"
  ADD CONSTRAINT "ejecuciones_reportes_motivo_detencion_check"
  CHECK ("motivo_detencion" IS NULL OR "motivo_detencion" = 'usuario');

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
  CONSTRAINT "ejecuciones_reportes_tipo_check" CHECK ("tipo_ejecucion" IN ('manual', 'programada')),
  CONSTRAINT "ejecuciones_reportes_estado_check" CHECK ("estado" IN ('preparando', 'iniciada', 'completada', 'error', 'detenida'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ejecuciones_reportes_configuracion_id_configuraciones_automatizacion_id_fk'
  ) THEN
    ALTER TABLE "ejecuciones_reportes"
      ADD CONSTRAINT "ejecuciones_reportes_configuracion_id_configuraciones_automatizacion_id_fk"
      FOREIGN KEY ("configuracion_id") REFERENCES "public"."configuraciones_automatizacion"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ejecuciones_reportes_config_fecha"
  ON "ejecuciones_reportes" USING btree ("configuracion_id", "creado_en");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ejecuciones_reportes_run_qlik"
  ON "ejecuciones_reportes" USING btree ("run_id_qlik");

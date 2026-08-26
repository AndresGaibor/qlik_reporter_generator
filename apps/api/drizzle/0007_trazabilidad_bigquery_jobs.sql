CREATE TABLE "jobs_bigquery_ejecucion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ejecucion_reporte_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"parent_job_id" text,
	"project_id" text NOT NULL,
	"location" text DEFAULT 'US',
	"tipo" text NOT NULL,
	"estado" text NOT NULL,
	"creation_time" timestamp,
	"start_time" timestamp,
	"end_time" timestamp,
	"duracion_ms" integer,
	"total_bytes_processed" text,
	"total_bytes_billed" text,
	"total_slot_ms" text,
	"cache_hit" boolean,
	"statement_type" text,
	"error_reason" text,
	"error_message" text,
	"metadata_json" jsonb,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_job_project_location" UNIQUE("project_id","location","job_id"),
	CONSTRAINT "jobs_bigquery_tipo_check" CHECK ("jobs_bigquery_ejecucion"."tipo" IN ('principal', 'script', 'query', 'export', 'conteo', 'child', 'desconocido')),
	CONSTRAINT "jobs_bigquery_estado_check" CHECK ("jobs_bigquery_ejecucion"."estado" IN ('pendiente', 'running', 'done', 'error'))
);
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "job_id_principal_bigquery" text;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "bigquery_project_id" text;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "bigquery_location" text;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "qlik_iniciado_en" timestamp;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "bigquery_iniciado_en" timestamp;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "bigquery_finalizado_en" timestamp;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "gcs_finalizado_en" timestamp;--> statement-breakpoint
ALTER TABLE "jobs_bigquery_ejecucion" ADD CONSTRAINT "jobs_bigquery_ejecucion_ejecucion_reporte_id_ejecuciones_reportes_id_fk" FOREIGN KEY ("ejecucion_reporte_id") REFERENCES "public"."ejecuciones_reportes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_ejecucion_reportes" ON "jobs_bigquery_ejecucion" USING btree ("ejecucion_reporte_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_job_id" ON "jobs_bigquery_ejecucion" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_estado" ON "jobs_bigquery_ejecucion" USING btree ("estado");
CREATE TABLE "resultados_ejecuciones_reportes" (
	"ejecucion_reporte_id" uuid PRIMARY KEY NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"tamano_almacenado_bytes" bigint,
	"objetos_fuente" bigint,
	"partes_descarga" integer,
	"maximo_filas_por_archivo_aplicado" bigint,
	"disponible_en" timestamp,
	"eliminado_en" timestamp,
	"eliminado_por_usuario_id" uuid,
	"motivo_eliminacion" text,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resultados_ejecuciones_reportes_estado_check" CHECK ("resultados_ejecuciones_reportes"."estado" IN ('pendiente', 'disponible', 'sin_archivos', 'eliminado', 'error_parcial')),
	CONSTRAINT "resultados_ejecuciones_reportes_metricas_check" CHECK ("resultados_ejecuciones_reportes"."tamano_almacenado_bytes" IS NULL OR "resultados_ejecuciones_reportes"."tamano_almacenado_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "filas_exportadas" bigint;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "fuente_filas_exportadas" text;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "total_bytes_processed" bigint;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "total_bytes_billed" bigint;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "total_slot_ms" bigint;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "duracion_bigquery_ms" bigint;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "tarifa_consulta_usd_por_tib_aplicada" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "costo_bigquery_usd" numeric(30, 12);--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "moneda_costo" text;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "version_formula_costo" integer;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "metricas_calculadas_en" timestamp;--> statement-breakpoint
ALTER TABLE "resultados_ejecuciones_reportes" ADD CONSTRAINT "resultados_ejecuciones_reportes_ejecucion_reporte_id_ejecuciones_reportes_id_fk" FOREIGN KEY ("ejecucion_reporte_id") REFERENCES "public"."ejecuciones_reportes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados_ejecuciones_reportes" ADD CONSTRAINT "resultados_ejecuciones_reportes_eliminado_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("eliminado_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_fuente_filas_check" CHECK ("ejecuciones_reportes"."fuente_filas_exportadas" IS NULL OR "ejecuciones_reportes"."fuente_filas_exportadas" IN ('pipeline', 'procesamiento_resultado', 'legacy'));--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_metricas_check" CHECK ("ejecuciones_reportes"."filas_exportadas" IS NULL OR "ejecuciones_reportes"."filas_exportadas" >= 0);--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_moneda_costo_check" CHECK ("ejecuciones_reportes"."moneda_costo" IS NULL OR "ejecuciones_reportes"."moneda_costo" = 'USD');--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_version_formula_costo_check" CHECK ("ejecuciones_reportes"."version_formula_costo" IS NULL OR "ejecuciones_reportes"."version_formula_costo" >= 1);
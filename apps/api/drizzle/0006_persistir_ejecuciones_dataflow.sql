ALTER TABLE "ejecuciones_reportes" ADD COLUMN "organizacion_id" uuid;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "tenant_qlik_id" uuid;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "flujo_nombre_snapshot" text;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD COLUMN "flujo_espacio_id_qlik" text;
--> statement-breakpoint
UPDATE "ejecuciones_reportes" AS e
SET
  "organizacion_id" = r."organizacion_id",
  "tenant_qlik_id" = r."tenant_qlik_id",
  "flujo_nombre_snapshot" = r."flujo_nombre_snapshot",
  "flujo_espacio_id_qlik" = r."flujo_espacio_id_qlik"
FROM "reportes" AS r
WHERE e."reporte_id" = r."id";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ejecuciones_reportes"
    WHERE "organizacion_id" IS NULL
       OR "tenant_qlik_id" IS NULL
       OR "flujo_nombre_snapshot" IS NULL
  ) THEN
    RAISE EXCEPTION '0006: ejecuciones_reportes sin contexto histórico para backfill';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ALTER COLUMN "organizacion_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ALTER COLUMN "tenant_qlik_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ALTER COLUMN "flujo_nombre_snapshot" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_tenant_qlik_id_tenants_qlik_id_fk" FOREIGN KEY ("tenant_qlik_id") REFERENCES "public"."tenants_qlik"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_ejecuciones_reportes_scope_fecha" ON "ejecuciones_reportes" USING btree ("organizacion_id", "tenant_qlik_id", "flujo_id_qlik", "creado_en");
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP CONSTRAINT "ejecuciones_reportes_reporte_id_reportes_id_fk";
--> statement-breakpoint
DROP INDEX "idx_ejecuciones_reportes_reporte_fecha";
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP COLUMN "reporte_id";
--> statement-breakpoint
DROP TABLE "reportes";

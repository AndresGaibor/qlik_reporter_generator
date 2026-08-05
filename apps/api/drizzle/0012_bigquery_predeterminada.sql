ALTER TABLE "conexiones_destino"
  ADD COLUMN IF NOT EXISTS "es_predeterminada" boolean NOT NULL DEFAULT false;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_conexion_bigquery_predeterminada_tenant"
  ON "conexiones_destino"("tenant_qlik_id", "tipo")
  WHERE "es_predeterminada" = true AND "tenant_qlik_id" IS NOT NULL;--> statement-breakpoint

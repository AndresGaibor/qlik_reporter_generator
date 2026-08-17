DROP TABLE IF EXISTS "programaciones_automatizacion" CASCADE;
DROP TABLE IF EXISTS "secretos_conexion_origen" CASCADE;
DROP TABLE IF EXISTS "conexiones_origen" CASCADE;
DROP TABLE IF EXISTS "destinos_cache" CASCADE;
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN IF EXISTS "programar";
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "destino_api_url", DROP COLUMN IF EXISTS "destino_api_key_cifrada", DROP COLUMN IF EXISTS "destino_base_datos";
UPDATE "ejecuciones_reportes" SET "tipo_ejecucion" = 'manual' WHERE "tipo_ejecucion" <> 'manual';
--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP CONSTRAINT IF EXISTS "ejecuciones_reportes_tipo_check";
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_tipo_check" CHECK ("tipo_ejecucion" = 'manual');
DELETE FROM "conexiones_destino" WHERE "tipo" <> 'bigquery';
ALTER TABLE "conexiones_destino" DROP CONSTRAINT IF EXISTS "conexiones_destino_tipo_check";
ALTER TABLE "conexiones_destino" ADD CONSTRAINT "conexiones_destino_tipo_check" CHECK ("tipo" = 'bigquery');

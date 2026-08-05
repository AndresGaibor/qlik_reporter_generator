-- Elimina Impala del esquema: columnas heredadas en tenants_qlik,
-- conexiones de destino Impala y su restricción de tipo.

DELETE FROM "conexiones_destino"
  WHERE "tipo" = 'impala';--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "conexiones_destino"
    DROP CONSTRAINT IF EXISTS "conexiones_destino_tipo_check";
END $$;--> statement-breakpoint

ALTER TABLE "conexiones_destino"
  ADD CONSTRAINT "conexiones_destino_tipo_check"
  CHECK ("tipo" IN ('bigquery', 'postgres', 'sftp'));--> statement-breakpoint

ALTER TABLE "tenants_qlik"
  DROP COLUMN IF EXISTS "impala_host",
  DROP COLUMN IF EXISTS "impala_port",
  DROP COLUMN IF EXISTS "impala_auth_mechanism",
  DROP COLUMN IF EXISTS "impala_user",
  DROP COLUMN IF EXISTS "impala_password",
  DROP COLUMN IF EXISTS "impala_password_cifrada",
  DROP COLUMN IF EXISTS "impala_database";

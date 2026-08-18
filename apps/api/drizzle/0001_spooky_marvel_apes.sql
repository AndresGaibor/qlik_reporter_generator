DROP TABLE IF EXISTS "automatizaciones_qlik_cache" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "espacios_qlik_cache" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "eventos_outbox" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "flujos_qlik_cache" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "intentos_oauth_qlik" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "_migrations_lock" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "configuracion_espacios_visibles" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "configuraciones_plataforma" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "espacios_visibles_usuario_final" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "secretos_conexion_destino" CASCADE;--> statement-breakpoint
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "automatizacion_plantilla_modo_1_id_qlik";--> statement-breakpoint
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "automatizacion_plantilla_modo_1_nombre";--> statement-breakpoint
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "automatizacion_plantilla_modo_2_id_qlik";--> statement-breakpoint
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "automatizacion_plantilla_modo_2_nombre";--> statement-breakpoint
ALTER TABLE "conexiones_destino" DROP COLUMN IF EXISTS "probada_en";--> statement-breakpoint
UPDATE "membresias_organizacion" SET "rol" = 'admin' WHERE "rol" = 'administrador';--> statement-breakpoint
UPDATE "membresias_organizacion" SET "rol" = 'usuario' WHERE "rol" IN ('editor', 'auditor');--> statement-breakpoint
ALTER TABLE "membresias_organizacion" DROP CONSTRAINT IF EXISTS "membresias_rol_check";--> statement-breakpoint
ALTER TABLE "membresias_organizacion" ADD CONSTRAINT "membresias_rol_check" CHECK ("membresias_organizacion"."rol" IN ('admin', 'usuario'));

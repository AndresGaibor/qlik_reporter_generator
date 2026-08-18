ALTER TABLE "configuraciones_automatizacion" DROP CONSTRAINT "configuraciones_automatizacion_clave_idempotencia_unique";--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP CONSTRAINT "ejecuciones_reportes_tipo_check";--> statement-breakpoint
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN "destino_proveedor";--> statement-breakpoint
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN "destino_id_externo";--> statement-breakpoint
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN "destino_nombre_snapshot";--> statement-breakpoint
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN "clave_idempotencia";--> statement-breakpoint
ALTER TABLE "ejecuciones_reportes" DROP COLUMN "tipo_ejecucion";
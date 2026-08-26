ALTER TABLE "tenants_qlik" ADD COLUMN "dataflow_plantillas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "tenants_qlik"
SET "dataflow_plantillas" = jsonb_build_array(jsonb_build_object(
  'id', "dataflow_base_id_qlik",
  'nombre', COALESCE("dataflow_base_nombre", 'Dataflow base')
))
WHERE "dataflow_base_id_qlik" IS NOT NULL;

import type { CatalogoMetadataBigQuery } from "../../../google-cloud/dominio/metadata-bigquery.js";
import { analizarProgramaQlik } from "./analizador-semantico.js";
import { emitirBigQueryVNext } from "./emisor-bigquery.js";
import { enriquecerPlanConMetadataBigQuery } from "./metadata-ir.js";
import type { DiagnosticoVNext } from "./modelo.js";
import { optimizarPlanRelacionalVNext } from "./optimizador-ir.js";
import { parsearProgramaQlik } from "./parser-programa.js";

export interface OpcionesCompilacionVNext {
  fieldTypes?: Readonly<Record<string, string>>;
  sourceMetadata?: CatalogoMetadataBigQuery;
}

export interface ResultadoCompilacionVNext {
  sql: string;
  strategy: "source_sql_passthrough" | "single_query";
  diagnostics: DiagnosticoVNext[];
}

export function compilarDataflowVNext(
  script: string,
  options: OpcionesCompilacionVNext = {},
): ResultadoCompilacionVNext {
  const program = parsearProgramaQlik(script);
  const plan = analizarProgramaQlik(program);
  const planTipado = enriquecerPlanConMetadataBigQuery(
    plan,
    options.sourceMetadata,
  );
  const planOptimizado = optimizarPlanRelacionalVNext(planTipado);
  const planFinal = enriquecerPlanConMetadataBigQuery(
    planOptimizado,
    options.sourceMetadata,
  );
  const emission = emitirBigQueryVNext(planFinal, options);
  return { ...emission, diagnostics: planFinal.diagnostics };
}

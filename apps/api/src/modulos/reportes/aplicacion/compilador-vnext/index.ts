import { analizarProgramaQlik } from "./analizador-semantico.js";
import { emitirBigQueryVNext } from "./emisor-bigquery.js";
import type { DiagnosticoVNext } from "./modelo.js";
import { optimizarPlanRelacionalVNext } from "./optimizador-ir.js";
import { parsearProgramaQlik } from "./parser-programa.js";

export interface ResultadoCompilacionVNext {
  sql: string;
  strategy: "source_sql_passthrough" | "single_query";
  diagnostics: DiagnosticoVNext[];
}

export function compilarDataflowVNext(
  script: string,
): ResultadoCompilacionVNext {
  const program = parsearProgramaQlik(script);
  const plan = analizarProgramaQlik(program);
  const planOptimizado = optimizarPlanRelacionalVNext(plan);
  const emission = emitirBigQueryVNext(planOptimizado);
  return { ...emission, diagnostics: plan.diagnostics };
}

import type { ExprQlik } from "../expresiones-qlik.js";

export type ClasificacionFuncionEstadistica =
  | "native_bigquery"
  | "sql_formula"
  | "udf_required"
  | "external_non_equivalent";

export interface ContextoEstadistica {
  emitValue(expression: ExprQlik): string;
  emitNumeric(expression: ExprQlik): string;
  fail(code: string, message: string): never;
}

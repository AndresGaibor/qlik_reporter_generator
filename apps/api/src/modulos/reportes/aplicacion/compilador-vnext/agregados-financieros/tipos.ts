import type { EntornoExpresionQlik, ExprQlik } from "../expresiones-qlik.js";

export type CallQlik = Extract<ExprQlik, { kind: "call" }>;

export interface CallbacksAgregadosFinancieros {
  emitValue(expression: ExprQlik, environment: EntornoExpresionQlik): string;
  emitNumeric(expression: ExprQlik, environment: EntornoExpresionQlik): string;
  emitNumericComponent(
    expression: ExprQlik,
    environment: EntornoExpresionQlik,
  ): string;
  emitText(expression: ExprQlik, environment: EntornoExpresionQlik): string;
  fail(code: string, message: string): never;
}

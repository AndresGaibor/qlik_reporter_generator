import type { EntornoExpresionQlik } from "../expresiones-qlik.js";
import { emitirAgregadoAgrupado } from "./agrupados.js";
import {
  GROUPED_FUNCTIONS,
  RANGE_FUNCTIONS,
  esAgregadoFinancieroQlik,
} from "./catalogo.js";
import { emitirFinancieroEscalar } from "./escalares.js";
import { emitirRange } from "./rangos.js";
import type { CallQlik, CallbacksAgregadosFinancieros } from "./tipos.js";

export function emitirAgregadoFinanciero(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string | undefined {
  const name = expression.name.toLowerCase();
  if (!esAgregadoFinancieroQlik(name)) return undefined;
  if (new Set(expression.modifiers ?? []).has("total"))
    callbacks.fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL depende del ámbito Qlik y no se puede eliminar silenciosamente`,
    );

  if (RANGE_FUNCTIONS.has(name))
    return emitirRange(name, expression, environment, callbacks);
  if (GROUPED_FUNCTIONS.has(name))
    return emitirAgregadoAgrupado(name, expression, environment, callbacks);
  return emitirFinancieroEscalar(name, expression, environment, callbacks);
}

import { emitNumericArgument, emitValue } from "./core-valores.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, fail, requiredArgument } from "./utilidades.js";

export function emitBasicAggregation(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL depende del ámbito Qlik y no se puede eliminar silenciosamente`,
      expression.name,
      0,
    );
  arity(expression.name, expression.args, 1);
  const argument = requiredArgument(expression.args[0]);
  const distinct = modifiers.has("distinct") ? "DISTINCT " : "";
  if (argument.kind === "wildcard") {
    if (name !== "count" || distinct)
      fail(
        "AGGREGATION_WILDCARD_INVALID",
        `${expression.name}(*) solo es válido como Count(*) sin DISTINCT`,
        expression.name,
        0,
      );
    return "COUNT(*)";
  }
  return `${name.toUpperCase()}(${distinct}${emitValue(argument, environment)})`;
}

export function emitOnly(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  arity(expression.name, expression.args, 1);
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL depende del ámbito Qlik y requiere lowering relacional`,
      expression.name,
      0,
    );
  const argument = requiredArgument(expression.args[0]);
  if (argument.kind === "wildcard")
    fail(
      "AGGREGATION_WILDCARD_INVALID",
      `${expression.name}(*) no es válido`,
      expression.name,
      0,
    );
  const value = emitValue(argument, environment);
  return `CASE WHEN COUNT(*) = COUNT(${value}) AND COUNT(DISTINCT ${value}) = 1 THEN ANY_VALUE(${value}) ELSE NULL END`;
}

export function emitCounterAggregation(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  arity(expression.name, expression.args, 1);
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL requiere el ámbito Qlik explícito`,
      expression.name,
      0,
    );
  if (modifiers.has("distinct"))
    fail(
      "AGGREGATION_DISTINCT_REQUIRES_TYPED_LOWERING",
      `${expression.name}(DISTINCT ...) requiere deduplicar usando el tipo/dual Qlik original`,
      expression.name,
      0,
    );
  const argument = requiredArgument(expression.args[0]);
  const value = emitValue(argument, environment);
  const numeric = emitNumericArgument(argument, environment);
  if (name === "nullcount") return `COUNTIF(${value} IS NULL)`;
  if (name === "numericcount") return `COUNTIF(${numeric} IS NOT NULL)`;
  if (name === "textcount")
    return `COUNTIF(${value} IS NOT NULL AND ${numeric} IS NULL)`;
  return `COUNTIF(${numeric} IS NULL)`;
}

export function emitBasicRange(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 1)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos un argumento`,
      originalName,
      0,
    );
  const numeric = args.map((arg) => emitNumericArgument(arg, environment));
  if (name === "rangesum")
    return numeric.map((value) => `COALESCE(${value}, 0)`).join(" + ");
  const fn = name === "rangeavg" ? "AVG" : name === "rangemin" ? "MIN" : "MAX";
  return `(SELECT ${fn}(value) FROM UNNEST([${numeric.join(", ")}]) AS value WHERE value IS NOT NULL)`;
}

export function emitRangeCounter(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 1)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos un argumento`,
      originalName,
      0,
    );
  const parts = args.map((arg) => {
    const value = emitValue(arg, environment);
    const numeric = emitNumericArgument(arg, environment);
    if (name === "rangecount")
      return `CASE WHEN ${value} IS NULL THEN 0 ELSE 1 END`;
    if (name === "rangenullcount")
      return `CASE WHEN ${value} IS NULL THEN 1 ELSE 0 END`;
    if (name === "rangenumericcount")
      return `CASE WHEN ${numeric} IS NOT NULL THEN 1 ELSE 0 END`;
    if (name === "rangetextcount")
      return `CASE WHEN ${value} IS NOT NULL AND ${numeric} IS NULL THEN 1 ELSE 0 END`;
    return `CASE WHEN ${numeric} IS NULL THEN 1 ELSE 0 END`;
  });
  return parts.join(" + ");
}

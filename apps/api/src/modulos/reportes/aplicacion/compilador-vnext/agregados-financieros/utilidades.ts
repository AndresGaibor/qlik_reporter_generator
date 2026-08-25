import type { EntornoExpresionQlik, ExprQlik } from "../expresiones-qlik.js";
import type { CallQlik, CallbacksAgregadosFinancieros } from "./tipos.js";

export function emitirFechaFinanciera(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const raw = callbacks.emitValue(expression, environment);
  const numeric = callbacks.emitNumericComponent(expression, environment);
  return `COALESCE(SAFE_CAST(CAST(${raw} AS STRING) AS DATE), DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${numeric} AS INT64) DAY))`;
}

export function emitirNewton(
  source: string,
  valuesField: string,
  dateField?: string,
): string {
  const usesDates = Boolean(dateField);
  const npv = usesDates
    ? "(SELECT SUM(value.value / POW(1 + rate, DATE_DIFF(value.date, first_date, DAY) / 365.0)) FROM UNNEST(values) AS value)"
    : "(SELECT SUM(value / POW(1 + rate, offset)) FROM UNNEST(values) AS value WITH OFFSET AS offset)";
  const derivative = usesDates
    ? "(SELECT SUM(-DATE_DIFF(value.date, first_date, DAY) / 365.0 * value.value / POW(1 + rate, DATE_DIFF(value.date, first_date, DAY) / 365.0 + 1)) FROM UNNEST(values) AS value)"
    : "(SELECT SUM(-offset * value / POW(1 + rate, offset + 1)) FROM UNNEST(values) AS value WITH OFFSET AS offset)";
  return `(WITH RECURSIVE cashflows AS (
  ${source}
), iterations AS (
  SELECT 0 AS iteration, CAST(0.1 AS FLOAT64) AS rate
  UNION ALL
  SELECT iteration + 1, rate - SAFE_DIVIDE(${npv}, ${derivative})
  FROM iterations CROSS JOIN cashflows
  WHERE iteration < 100 AND rate > -0.999999999999
), last_iteration AS (
  SELECT rate FROM iterations ORDER BY iteration DESC LIMIT 1
)
SELECT CASE
  WHEN negatives = 0 OR positives = 0 OR ${usesDates ? "first_date IS NULL" : "FALSE"} THEN NULL
  ELSE rate
END
FROM last_iteration CROSS JOIN cashflows)`;
}

export function ensureAtLeastOne(
  expression: CallQlik,
  callbacks: CallbacksAgregadosFinancieros,
): void {
  if (expression.args.length < 1)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere al menos un argumento`,
    );
}

export function arity(
  expression: CallQlik,
  callbacks: CallbacksAgregadosFinancieros,
  expected: number,
): void {
  if (expression.args.length !== expected)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere ${expected} argumentos y recibió ${expression.args.length}`,
    );
}

export function requiredArgument<T>(
  value: T | undefined,
  expression: CallQlik,
  callbacks: CallbacksAgregadosFinancieros,
): T {
  if (value === undefined)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere un argumento`,
    );
  return value;
}

export function arityRange(
  expression: CallQlik,
  callbacks: CallbacksAgregadosFinancieros,
  min: number,
  max: number,
): void {
  if (expression.args.length < min || expression.args.length > max)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere entre ${min} y ${max} argumentos y recibió ${expression.args.length}`,
    );
}

export function requiredOrder(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const order = environment.aggregationOrderBy;
  if (!order || order.length === 0)
    callbacks.fail(
      "AGGREGATION_ORDER_REQUIRED",
      `${expression.name} requiere ORDER BY probado para preservar el orden Qlik`,
    );
  return order.join(", ");
}

export function invertOrder(order: string): string {
  return order
    .split(",")
    .map((item) => {
      const match = item.trim().match(/^(.*?)(?:\s+(ASC|DESC))?$/i);
      if (!match?.[1]) return item.trim();
      const direction = match[2]?.toUpperCase() === "DESC" ? "ASC" : "DESC";
      return `${match[1].trim()} ${direction}`;
    })
    .join(", ");
}

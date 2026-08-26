import type { EntornoExpresionQlik, ExprQlik } from "../expresiones-qlik.js";
import type { CallQlik, CallbacksAgregadosFinancieros } from "./tipos.js";
import {
  arity,
  arityRange,
  emitirFechaFinanciera,
  emitirNewton,
  invertOrder,
  requiredArgument,
  requiredOrder,
} from "./utilidades.js";

export function emitirAgregadoAgrupado(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (name === "concat")
    return emitirConcat(expression, environment, callbacks);
  if (name === "firstsortedvalue")
    return emitirFirstSortedValue(expression, environment, callbacks);
  if (name === "firstvalue" || name === "lastvalue")
    return emitirFirstLast(name, expression, environment, callbacks);
  if (name === "maxstring" || name === "minstring")
    return emitirGroupedString(name, expression, environment, callbacks);
  if (name === "mode")
    return emitirGroupedMode(expression, environment, callbacks);
  if (name === "only")
    return emitirGroupedOnly(expression, environment, callbacks);
  if (name === "irr")
    return emitirGroupedIrr(expression, environment, callbacks);
  if (name === "npv")
    return emitirGroupedNpv(expression, environment, callbacks);
  if (name === "xirr")
    return emitirGroupedXirr(expression, environment, callbacks);
  if (name === "xnpv")
    return emitirGroupedXnpv(expression, environment, callbacks);
  callbacks.fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} no tiene lowering`,
  );
}

export function emitirConcat(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 1, 3);
  const value = callbacks.emitText(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const delimiter = expression.args[1]
    ? `CAST(${callbacks.emitValue(expression.args[1], environment)} AS STRING)`
    : "','";
  const weight = expression.args[2]
    ? callbacks.emitNumeric(expression.args[2], environment)
    : undefined;
  const order = weight
    ? `${weight} ASC`
    : requiredOrder(expression, environment, callbacks);
  const distinct = new Set(expression.modifiers ?? []).has("distinct")
    ? "DISTINCT "
    : "";
  return `STRING_AGG(${distinct}${value}, ${delimiter} ORDER BY ${order})`;
}

export function emitirFirstSortedValue(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 2, 3);
  const value = callbacks.emitValue(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const weight = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const rank = expression.args[2]
    ? `CAST(${callbacks.emitNumeric(expression.args[2], environment)} AS INT64)`
    : "1";
  return `(SELECT CASE WHEN COUNT(*) = 1 THEN ANY_VALUE(value) ELSE NULL END
FROM (
  SELECT item.value AS value, item.weight,
    ROW_NUMBER() OVER (ORDER BY item.weight ASC) AS row_number,
    COUNT(*) OVER (PARTITION BY item.weight) AS tie_count
  FROM UNNEST(ARRAY_AGG(STRUCT(${value} AS value, ${weight} AS weight))) AS item
  WHERE item.value IS NOT NULL AND item.weight IS NOT NULL
)
WHERE row_number = ${rank} AND tie_count = 1)`;
}

export function emitirFirstLast(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 1);
  const provenOrder = requiredOrder(expression, environment, callbacks);
  const order = name === "firstvalue" ? provenOrder : invertOrder(provenOrder);
  const value = callbacks.emitValue(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  return `(ARRAY_AGG(${value} IGNORE NULLS ORDER BY ${order} LIMIT 1))[SAFE_OFFSET(0)]`;
}

export function emitirGroupedString(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 1);
  const value = callbacks.emitText(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const direction = name === "maxstring" ? "DESC" : "ASC";
  return `(ARRAY_AGG(${value} IGNORE NULLS ORDER BY ${value} ${direction} LIMIT 1))[SAFE_OFFSET(0)]`;
}

export function emitirGroupedMode(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 1);
  return emitirModeDesdeRows(
    emitirTypedRows(
      requiredArgument(expression.args[0], expression, callbacks),
      environment,
      callbacks,
    ),
  );
}

export function emitirGroupedOnly(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 1);
  const rows = emitirTypedRows(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
    callbacks,
  );
  return `(SELECT CASE WHEN COUNT(DISTINCT key) = 1 THEN ANY_VALUE(visible) ELSE NULL END
FROM (
  SELECT item.visible AS visible,
    CASE WHEN item.numeric IS NOT NULL THEN CONCAT('N:', CAST(item.numeric AS STRING))
         ELSE CONCAT('T:', item.text) END AS key
  FROM ${rows}
  WHERE item.visible IS NOT NULL
))`;
}

export function emitirModeDesdeRows(rows: string): string {
  return `(WITH values AS (
  SELECT item.visible AS visible,
    CASE WHEN item.visible IS NULL THEN NULL ELSE item.key END AS key
  FROM ${rows}
  WHERE item.visible IS NOT NULL
), counts AS (
  SELECT key, ANY_VALUE(visible) AS visible, COUNT(*) AS frequency
  FROM values
  GROUP BY key
), ranked AS (
  SELECT *, MAX(frequency) OVER () AS max_frequency
  FROM counts
)
SELECT CASE
  WHEN COUNT(DISTINCT key) = 0 OR COUNTIF(frequency = max_frequency) != 1 THEN NULL
  ELSE ANY_VALUE(IF(frequency = max_frequency, visible, NULL))
END
FROM ranked)`;
}

export function emitirTypedRows(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const visible = callbacks.emitValue(expression, environment);
  const numeric = callbacks.emitNumericComponent(expression, environment);
  const text = callbacks.emitText(expression, environment);
  return `UNNEST(ARRAY_AGG(STRUCT(${visible} AS visible, ${numeric} AS numeric, ${text} AS text))) AS item`;
}

export function emitirGroupedIrr(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 1);
  const value = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  return emitirNewton(
    `SELECT ARRAY_AGG(CAST(${value} AS FLOAT64) IGNORE NULLS) AS values,
      COUNTIF(${value} < 0) AS negatives, COUNTIF(${value} > 0) AS positives`,
    "values",
  );
}

export function emitirGroupedNpv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 2);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const value = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  return `(SELECT CASE WHEN ${rate} IS NULL OR ${rate} <= -1 THEN NULL ELSE SUM(
  SAFE_DIVIDE(CAST(value AS FLOAT64), POW(1 + CAST(${rate} AS FLOAT64), offset + 1))
)
FROM UNNEST(ARRAY_AGG(CAST(${value} AS FLOAT64) IGNORE NULLS)) AS value WITH OFFSET AS offset)`;
}

export function emitirGroupedXirr(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 2);
  const value = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const date = emitirFechaFinanciera(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
    callbacks,
  );
  return emitirNewton(
    `SELECT ARRAY_AGG(STRUCT(CAST(${value} AS FLOAT64) AS value, ${date} AS date) IGNORE NULLS) AS values,
      MIN(${date}) AS first_date, COUNTIF(${value} < 0) AS negatives, COUNTIF(${value} > 0) AS positives`,
    "values",
    "date",
  );
}

export function emitirGroupedXnpv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 3);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const value = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const date = emitirFechaFinanciera(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
    callbacks,
  );
  return `(WITH cashflows AS (
  SELECT ARRAY_AGG(STRUCT(CAST(${value} AS FLOAT64) AS value, ${date} AS date) IGNORE NULLS) AS values,
    MIN(${date}) AS first_date,
    COUNTIF(${value} < 0 AND ${date} IS NOT NULL) AS negatives,
    COUNTIF(${value} > 0 AND ${date} IS NOT NULL) AS positives
)
SELECT CASE WHEN ${rate} IS NULL OR ${rate} <= -1 OR first_date IS NULL OR negatives = 0 OR positives = 0 THEN NULL ELSE (
  SELECT SUM(SAFE_DIVIDE(item.value, POW(1 + CAST(${rate} AS FLOAT64), DATE_DIFF(item.date, first_date, DAY) / 365.0)))
  FROM UNNEST(values) AS item
) END
FROM cashflows)`;
}

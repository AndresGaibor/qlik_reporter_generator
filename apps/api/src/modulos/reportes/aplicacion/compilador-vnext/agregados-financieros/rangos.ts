import type { EntornoExpresionQlik, ExprQlik } from "../expresiones-qlik.js";
import { emitirModeDesdeRows } from "./agrupados.js";
import type { CallQlik, CallbacksAgregadosFinancieros } from "./tipos.js";
import {
  emitirFechaFinanciera,
  emitirNewton,
  ensureAtLeastOne,
  requiredArgument,
} from "./utilidades.js";

export function emitirRange(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const args = expression.args;
  if (name === "rangecorrel")
    return emitirRangeCorrel(expression, environment, callbacks);
  if (name === "rangefractile")
    return emitirRangeFractile(expression, environment, callbacks);
  if (name === "rangeirr")
    return emitirRangeIrr(expression, environment, callbacks);
  if (name === "rangekurtosis")
    return emitirRangeKurtosis(expression, environment, callbacks);
  if (name === "rangemaxstring" || name === "rangeminstring")
    return emitirRangeString(name, expression, environment, callbacks);
  if (name === "rangemode")
    return emitirRangeMode(expression, environment, callbacks);
  if (name === "rangeonly")
    return emitirRangeOnly(expression, environment, callbacks);
  if (name === "rangenpv")
    return emitirRangeNpv(expression, environment, callbacks);
  if (name === "rangeskew")
    return emitirRangeSkew(expression, environment, callbacks);
  if (name === "rangestdev")
    return emitirRangeStdev(expression, environment, callbacks);
  if (name === "rangexirr")
    return emitirRangeXirr(expression, environment, callbacks);
  if (name === "rangexnpv")
    return emitirRangeXnpv(expression, environment, callbacks);
  callbacks.fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} no tiene lowering`,
  );
}

export function emitirRangeCorrel(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const args = expression.args;
  if (args.length < 4 || args.length % 2 !== 0)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere al menos dos pares de argumentos`,
    );
  const pairs: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const xExpression = args[index];
    const yExpression = args[index + 1];
    if (xExpression === undefined || yExpression === undefined)
      callbacks.fail(
        "FUNCTION_ARITY",
        `${expression.name} requiere pares completos de argumentos`,
      );
    const x = callbacks.emitNumeric(xExpression, environment);
    const y = callbacks.emitNumeric(yExpression, environment);
    pairs.push(
      `STRUCT(CAST(${x} AS FLOAT64) AS x, CAST(${y} AS FLOAT64) AS y)`,
    );
  }
  return `(SELECT CORR(x, y) FROM UNNEST([${pairs.join(", ")}]) AS pair WHERE x IS NOT NULL AND y IS NOT NULL)`;
}

export function emitirRangeFractile(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (expression.args.length < 2)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere fractil y valores`,
    );
  const percentile = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const values = expression.args
    .slice(1)
    .map((arg) => callbacks.emitNumeric(arg, environment));
  return `(WITH ordered AS (
  SELECT ARRAY_AGG(CAST(value AS FLOAT64) ORDER BY value) AS values, COUNT(*) AS n
  FROM UNNEST([${values.join(", ")}]) AS value
  WHERE value IS NOT NULL
), positions AS (
  SELECT values, n, 1 + (n - 1) * CAST(${percentile} AS FLOAT64) AS position
  FROM ordered
)
SELECT CASE
  WHEN ${percentile} IS NULL OR ${percentile} < 0 OR ${percentile} > 1 OR n = 0 THEN NULL
  ELSE values[SAFE_OFFSET(CAST(FLOOR(position) AS INT64) - 1)]
       + (position - FLOOR(position)) * (
         values[SAFE_OFFSET(CAST(CEIL(position) AS INT64) - 1)]
         - values[SAFE_OFFSET(CAST(FLOOR(position) AS INT64) - 1)]
       )
END
FROM positions)`;
}

export function emitirRangeKurtosis(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const values = expression.args.map((arg) =>
    callbacks.emitNumeric(arg, environment),
  );
  return `(WITH base AS (
  SELECT CAST(value AS FLOAT64) AS value
  FROM UNNEST([${values.join(", ")}]) AS value
  WHERE value IS NOT NULL
), stats AS (
  SELECT
    COUNT(*) AS n,
    SUM(POW(value - mean, 2)) AS m2_sum,
    SUM(POW(value - mean, 4)) AS m4_sum
  FROM base CROSS JOIN (SELECT AVG(value) AS mean FROM base)
)
SELECT CASE
  WHEN n < 4 OR m2_sum = 0 THEN NULL
  ELSE SAFE_DIVIDE(
    (n - 1) * ((n + 1) * (SAFE_DIVIDE(n * m4_sum, POW(m2_sum, 2)) - 3) + 6),
    (n - 2) * (n - 3)
  )
END
FROM stats)`;
}

export function emitirRangeSkew(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const values = expression.args.map((arg) =>
    callbacks.emitNumeric(arg, environment),
  );
  return `(WITH base AS (
  SELECT CAST(value AS FLOAT64) AS value
  FROM UNNEST([${values.join(", ")}]) AS value
  WHERE value IS NOT NULL
), stats AS (
  SELECT
    COUNT(*) AS n,
    SUM(POW(value - mean, 2)) AS m2_sum,
    SUM(POW(value - mean, 3)) AS m3_sum
  FROM base CROSS JOIN (SELECT AVG(value) AS mean FROM base)
)
SELECT CASE
  WHEN n < 3 OR m2_sum = 0 THEN NULL
  ELSE SAFE_DIVIDE(n * m3_sum * POW(n - 1, 0.5), (n - 2) * POW(m2_sum, 1.5))
END
FROM stats)`;
}

export function emitirRangeStdev(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const values = expression.args.map((arg) =>
    callbacks.emitNumeric(arg, environment),
  );
  return `(SELECT STDDEV_SAMP(CAST(value AS FLOAT64)) FROM UNNEST([${values.join(", ")}]) AS value WHERE value IS NOT NULL)`;
}

export function emitirRangeString(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const values = expression.args.map((arg) =>
    callbacks.emitText(arg, environment),
  );
  const direction = name === "rangemaxstring" ? "DESC" : "ASC";
  return `(SELECT ARRAY_AGG(value ORDER BY value ${direction} LIMIT 1)[SAFE_OFFSET(0)]
FROM UNNEST([${values.join(", ")}]) AS value WHERE value IS NOT NULL)`;
}

export function emitirRangeMode(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const useText = expression.args.some((arg) => arg.kind === "string");
  const values = expression.args.map((arg) => {
    const visible = useText
      ? callbacks.emitText(arg, environment)
      : callbacks.emitNumeric(arg, environment);
    return `STRUCT(${visible} AS visible, CASE WHEN ${visible} IS NULL THEN NULL ELSE CONCAT('${useText ? "T" : "N"}:', CAST(${visible} AS STRING)) END AS key)`;
  });
  return emitirModeDesdeRows(`UNNEST([${values.join(", ")}]) AS item`);
}

export function emitirRangeOnly(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const useText = expression.args.some((arg) => arg.kind === "string");
  const values = expression.args.map((arg) => {
    const visible = useText
      ? callbacks.emitText(arg, environment)
      : callbacks.emitNumeric(arg, environment);
    return `STRUCT(${visible} AS visible, CASE WHEN ${visible} IS NULL THEN NULL ELSE CONCAT('${useText ? "T" : "N"}:', CAST(${visible} AS STRING)) END AS key)`;
  });
  return `(SELECT CASE WHEN COUNT(DISTINCT key) = 1 THEN ANY_VALUE(visible) ELSE NULL END
FROM UNNEST([${values.join(", ")}]) AS item
WHERE item.visible IS NOT NULL)`;
}

export function emitirRangeNpv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (expression.args.length < 2)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere tasa y flujos`,
    );
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const values = expression.args
    .slice(1)
    .map((arg) => callbacks.emitNumeric(arg, environment));
  return `(SELECT CASE WHEN ${rate} IS NULL OR ${rate} <= -1 THEN NULL ELSE SUM(
  SAFE_DIVIDE(CAST(value AS FLOAT64), POW(1 + CAST(${rate} AS FLOAT64), offset + 1))
)
FROM UNNEST([${values.join(", ")}]) AS value WITH OFFSET AS offset
WHERE value IS NOT NULL)`;
}

export function emitirRangeIrr(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  ensureAtLeastOne(expression, callbacks);
  const values = expression.args.map((arg) =>
    callbacks.emitNumeric(arg, environment),
  );
  return emitirNewton(
    `SELECT ARRAY_AGG(CAST(value AS FLOAT64) ORDER BY offset) AS values,
      COUNTIF(value < 0) AS negatives, COUNTIF(value > 0) AS positives
     FROM UNNEST([${values.join(", ")}]) AS value WITH OFFSET AS offset
     WHERE value IS NOT NULL`,
    "values",
  );
}

export function emitirRangeXnpv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (expression.args.length < 3 || expression.args.length % 2 !== 1)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere tasa y pares flujo/fecha`,
    );
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const rows = emitirRangeCashflowRows(
    expression.args.slice(1),
    environment,
    callbacks,
  );
  return `(WITH cashflows AS (
  SELECT ARRAY_AGG(item ORDER BY item.date) AS values, MIN(item.date) AS first_date,
    COUNTIF(item.value < 0) AS negatives, COUNTIF(item.value > 0) AS positives
  FROM UNNEST([${rows.join(", ")}]) AS item
  WHERE item.value IS NOT NULL AND item.date IS NOT NULL
)
SELECT CASE WHEN ${rate} IS NULL OR ${rate} <= -1 OR first_date IS NULL OR negatives = 0 OR positives = 0 THEN NULL ELSE (
  SELECT SUM(SAFE_DIVIDE(value.value, POW(1 + CAST(${rate} AS FLOAT64), DATE_DIFF(value.date, first_date, DAY) / 365.0)))
  FROM UNNEST(values) AS value
) END
FROM cashflows)`;
}

export function emitirRangeXirr(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (expression.args.length < 4 || expression.args.length % 2 !== 0)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere pares flujo/fecha`,
    );
  const rows = emitirRangeCashflowRows(expression.args, environment, callbacks);
  return emitirNewton(
    `SELECT ARRAY_AGG(STRUCT(CAST(item.value AS FLOAT64) AS value, item.date AS date) ORDER BY item.date) AS values,
      MIN(item.date) AS first_date,
      COUNTIF(item.value < 0) AS negatives, COUNTIF(item.value > 0) AS positives
     FROM UNNEST([${rows.join(", ")}]) AS item
     WHERE item.value IS NOT NULL AND item.date IS NOT NULL`,
    "values",
    "date",
  );
}

export function emitirRangeCashflowRows(
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string[] {
  const rows: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const valueExpression = args[index];
    const dateExpression = args[index + 1];
    if (valueExpression === undefined || dateExpression === undefined)
      callbacks.fail(
        "FUNCTION_ARITY",
        "La función financiera requiere pares completos de argumentos",
      );
    const value = callbacks.emitNumeric(valueExpression, environment);
    const date = emitirFechaFinanciera(dateExpression, environment, callbacks);
    rows.push(`STRUCT(CAST(${value} AS FLOAT64) AS value, ${date} AS date)`);
  }
  return rows;
}

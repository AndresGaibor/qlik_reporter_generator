import type { EntornoExpresionQlik, ExprQlik } from "./expresiones-qlik.js";

type CallQlik = Extract<ExprQlik, { kind: "call" }>;

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

const RANGE_FUNCTIONS = new Set([
  "rangecorrel",
  "rangefractile",
  "rangeirr",
  "rangekurtosis",
  "rangemaxstring",
  "rangeminstring",
  "rangemode",
  "rangeonly",
  "rangenpv",
  "rangeskew",
  "rangestdev",
  "rangexirr",
  "rangexnpv",
]);

const GROUPED_FUNCTIONS = new Set([
  "concat",
  "firstsortedvalue",
  "firstvalue",
  "irr",
  "lastvalue",
  "maxstring",
  "minstring",
  "mode",
  "npv",
  "only",
  "xirr",
  "xnpv",
]);

const SCALAR_FINANCIAL_FUNCTIONS = new Set([
  "blackandschole",
  "fv",
  "nper",
  "pmt",
  "pv",
  "rate",
]);

export function esAgregadoFinancieroQlik(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    RANGE_FUNCTIONS.has(normalized) ||
    GROUPED_FUNCTIONS.has(normalized) ||
    SCALAR_FINANCIAL_FUNCTIONS.has(normalized)
  );
}

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

function emitirRange(
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

function emitirRangeCorrel(
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

function emitirRangeFractile(
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

function emitirRangeKurtosis(
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

function emitirRangeSkew(
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

function emitirRangeStdev(
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

function emitirRangeString(
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

function emitirRangeMode(
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

function emitirRangeOnly(
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

function emitirRangeNpv(
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

function emitirRangeIrr(
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

function emitirRangeXnpv(
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

function emitirRangeXirr(
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

function emitirRangeCashflowRows(
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

function emitirFechaFinanciera(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const raw = callbacks.emitValue(expression, environment);
  const numeric = callbacks.emitNumericComponent(expression, environment);
  return `COALESCE(SAFE_CAST(CAST(${raw} AS STRING) AS DATE), DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${numeric} AS INT64) DAY))`;
}

function emitirNewton(
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

function emitirAgregadoAgrupado(
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

function emitirConcat(
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

function emitirFirstSortedValue(
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

function emitirFirstLast(
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

function emitirGroupedString(
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

function emitirGroupedMode(
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

function emitirGroupedOnly(
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

function emitirModeDesdeRows(rows: string): string {
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

function emitirTypedRows(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  const visible = callbacks.emitValue(expression, environment);
  const numeric = callbacks.emitNumericComponent(expression, environment);
  const text = callbacks.emitText(expression, environment);
  return `UNNEST(ARRAY_AGG(STRUCT(${visible} AS visible, ${numeric} AS numeric, ${text} AS text))) AS item`;
}

function emitirGroupedIrr(
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

function emitirGroupedNpv(
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

function emitirGroupedXirr(
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

function emitirGroupedXnpv(
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

function emitirFinancieroEscalar(
  name: string,
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  if (name === "blackandschole")
    return emitirBlackAndSchole(expression, environment, callbacks);
  if (name === "fv") return emitirFv(expression, environment, callbacks);
  if (name === "nper") return emitirNper(expression, environment, callbacks);
  if (name === "pmt") return emitirPmt(expression, environment, callbacks);
  if (name === "pv") return emitirPv(expression, environment, callbacks);
  if (name === "rate") return emitirRate(expression, environment, callbacks);
  callbacks.fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} no tiene lowering`,
  );
}

function emitirBlackAndSchole(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arity(expression, callbacks, 6);
  const [exercise, time, stock, volatility, riskFree] = expression.args
    .slice(0, 5)
    .map((arg) => callbacks.emitNumeric(arg, environment));
  const optionType = callbacks.emitValue(
    requiredArgument(expression.args[5], expression, callbacks),
    environment,
  );
  return `(WITH params AS (
  SELECT CAST(${stock} AS FLOAT64) AS stock, CAST(${exercise} AS FLOAT64) AS exercise,
    CAST(${riskFree} AS FLOAT64) AS risk_free, CAST(${time} AS FLOAT64) AS time,
    CAST(${volatility} AS FLOAT64) AS volatility,
    CAST(${optionType} AS STRING) AS option_type
), d AS (
  SELECT *, (LOG(stock / exercise) + (risk_free + POW(volatility, 2) / 2) * time) / (volatility * SQRT(time)) AS d1
  FROM params
)
SELECT CASE WHEN stock > 0 AND exercise > 0 AND time > 0 AND volatility != 0 AND risk_free != 0
  THEN CASE WHEN LOWER(option_type) IN ('p', 'put') OR SAFE_CAST(option_type AS FLOAT64) = 0
    THEN exercise * EXP(-risk_free * time) * (1 + ERF(-(d1 - volatility * SQRT(time)) / SQRT(2))) / 2
      - stock * (1 + ERF(-d1 / SQRT(2))) / 2
    ELSE stock * (1 + ERF(d1 / SQRT(2))) / 2
      - exercise * EXP(-risk_free * time) * (1 + ERF((d1 - volatility * SQRT(time)) / SQRT(2))) / 2
  END
  ELSE NULL END
FROM d)`;
}

function emitirFv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 3, 5);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const periods = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const payment = callbacks.emitNumeric(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
  );
  const present = expression.args[3]
    ? callbacks.emitNumeric(expression.args[3], environment)
    : "0";
  const type = expression.args[4]
    ? callbacks.emitNumeric(expression.args[4], environment)
    : "0";
  return `CASE WHEN ${rate} IS NULL OR ${periods} IS NULL OR ${payment} IS NULL OR ${present} IS NULL OR ${type} IS NULL OR ${rate} <= -1 THEN NULL
  WHEN ${rate} = 0 THEN -(${present} + ${payment} * ${periods})
  ELSE -(${present} * POW(1 + ${rate}, ${periods}) + ${payment} * (1 + ${rate} * ${type}) * SAFE_DIVIDE(POW(1 + ${rate}, ${periods}) - 1, ${rate})) END`;
}

function emitirNper(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 3, 5);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const payment = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const present = callbacks.emitNumeric(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
  );
  const future = expression.args[3]
    ? callbacks.emitNumeric(expression.args[3], environment)
    : "0";
  const type = expression.args[4]
    ? callbacks.emitNumeric(expression.args[4], environment)
    : "0";
  const numerator = `${payment} * (1 + ${rate} * ${type}) - ${future} * ${rate}`;
  const denominator = `${present} * ${rate} + ${payment} * (1 + ${rate} * ${type})`;
  return `CASE WHEN ${rate} IS NULL OR ${payment} IS NULL OR ${present} IS NULL OR ${future} IS NULL OR ${type} IS NULL OR ${rate} <= -1 THEN NULL
  WHEN ${rate} = 0 THEN SAFE_DIVIDE(-(${present} + ${future}), ${payment})
  WHEN SAFE_DIVIDE(${numerator}, ${denominator}) IS NULL OR SAFE_DIVIDE(${numerator}, ${denominator}) <= 0 THEN NULL
  ELSE SAFE_DIVIDE(LOG(SAFE_DIVIDE(${numerator}, ${denominator})), LOG(1 + ${rate})) END`;
}

function emitirPmt(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 3, 5);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const periods = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const present = callbacks.emitNumeric(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
  );
  const future = expression.args[3]
    ? callbacks.emitNumeric(expression.args[3], environment)
    : "0";
  const type = expression.args[4]
    ? callbacks.emitNumeric(expression.args[4], environment)
    : "0";
  return `CASE WHEN ${rate} IS NULL OR ${periods} IS NULL OR ${present} IS NULL OR ${future} IS NULL OR ${type} IS NULL OR ${rate} <= -1 OR ${periods} = 0 THEN NULL
  WHEN ${rate} = 0 THEN SAFE_DIVIDE(-(${present} + ${future}), ${periods})
  ELSE SAFE_DIVIDE(-(${future} + ${present} * POW(1 + ${rate}, ${periods})) * ${rate}, (1 + ${rate} * ${type}) * (POW(1 + ${rate}, ${periods}) - 1)) END`;
}

function emitirPv(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 3, 5);
  const rate = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const periods = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const payment = callbacks.emitNumeric(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
  );
  const future = expression.args[3]
    ? callbacks.emitNumeric(expression.args[3], environment)
    : "0";
  const type = expression.args[4]
    ? callbacks.emitNumeric(expression.args[4], environment)
    : "0";
  return `CASE WHEN ${rate} IS NULL OR ${periods} IS NULL OR ${payment} IS NULL OR ${future} IS NULL OR ${type} IS NULL OR ${rate} <= -1 THEN NULL
  WHEN ${rate} = 0 THEN -(${future} + ${payment} * ${periods})
  ELSE SAFE_DIVIDE(-(${future} + ${payment} * (1 + ${rate} * ${type}) * SAFE_DIVIDE(POW(1 + ${rate}, ${periods}) - 1, ${rate})), POW(1 + ${rate}, ${periods})) END`;
}

function emitirRate(
  expression: CallQlik,
  environment: EntornoExpresionQlik,
  callbacks: CallbacksAgregadosFinancieros,
): string {
  arityRange(expression, callbacks, 3, 5);
  const periods = callbacks.emitNumeric(
    requiredArgument(expression.args[0], expression, callbacks),
    environment,
  );
  const payment = callbacks.emitNumeric(
    requiredArgument(expression.args[1], expression, callbacks),
    environment,
  );
  const present = callbacks.emitNumeric(
    requiredArgument(expression.args[2], expression, callbacks),
    environment,
  );
  const future = expression.args[3]
    ? callbacks.emitNumeric(expression.args[3], environment)
    : "0";
  const type = expression.args[4]
    ? callbacks.emitNumeric(expression.args[4], environment)
    : "0";
  const guess = "0.1";
  const f =
    "(present * POW(1 + rate, periods) + payment * (1 + rate * type) * SAFE_DIVIDE(POW(1 + rate, periods) - 1, rate) + future)";
  const df =
    "(present * periods * POW(1 + rate, periods - 1) + payment * (1 + rate * type) * SAFE_DIVIDE(periods * rate * POW(1 + rate, periods - 1) - (POW(1 + rate, periods) - 1), POW(rate, 2)))";
  return `(WITH RECURSIVE params AS (
  SELECT CAST(${periods} AS FLOAT64) AS periods, CAST(${payment} AS FLOAT64) AS payment,
    CAST(${present} AS FLOAT64) AS present, CAST(${future} AS FLOAT64) AS future,
    CAST(${type} AS FLOAT64) AS type
), iterations AS (
  SELECT 0 AS iteration, CAST(${guess} AS FLOAT64) AS rate
  FROM params
  UNION ALL
  SELECT iteration + 1, rate - SAFE_DIVIDE(${f}, ${df})
  FROM iterations CROSS JOIN params
  WHERE iteration < 100 AND rate > -0.999999999999
), result AS (
  SELECT rate FROM iterations ORDER BY iteration DESC LIMIT 1
)
SELECT CASE WHEN periods IS NULL OR payment IS NULL OR present IS NULL OR future IS NULL OR type IS NULL THEN NULL ELSE rate END
FROM result CROSS JOIN params)`;
}

function ensureAtLeastOne(
  expression: CallQlik,
  callbacks: CallbacksAgregadosFinancieros,
): void {
  if (expression.args.length < 1)
    callbacks.fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere al menos un argumento`,
    );
}

function arity(
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

function requiredArgument<T>(
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

function arityRange(
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

function requiredOrder(
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

function invertOrder(order: string): string {
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

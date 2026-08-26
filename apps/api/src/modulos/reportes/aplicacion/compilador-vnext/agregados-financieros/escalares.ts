import type { EntornoExpresionQlik } from "../expresiones-qlik.js";
import type { CallQlik, CallbacksAgregadosFinancieros } from "./tipos.js";
import { arity, arityRange, requiredArgument } from "./utilidades.js";

export function emitirFinancieroEscalar(
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

export function emitirBlackAndSchole(
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

export function emitirFv(
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

export function emitirNper(
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

export function emitirPmt(
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

export function emitirPv(
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

export function emitirRate(
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

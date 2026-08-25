import {
  translateQlikDateFormat,
  translateQlikNumberFormat,
} from "./conversiones.js";
import {
  emitNumericArgument,
  emitNumericValue,
  emitValue,
} from "./core-valores.js";
import { qlikSerialFromTimestamp } from "./numericas.js";
import { emitCondition } from "./operadores.js";
import {
  parseQlikInterval,
  translateQlikTimeFormat,
  translateQlikTimestampFormat,
} from "./temporal-formato.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arityRange,
  fail,
  literalString,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitConditionalValue(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const args = expression.args;
  if (name === "alt") {
    arityRange(expression.name, args, 2, Number.MAX_SAFE_INTEGER);
    const candidates = args.slice(0, -1);
    const fallback = requiredArgument(args[args.length - 1]);
    const branches = candidates
      .map((candidate) => {
        const numeric = emitNumericValue(candidate, environment);
        return `WHEN ${numeric} IS NOT NULL THEN ${emitValue(candidate, environment)}`;
      })
      .join(" ");
    return `CASE ${branches} ELSE ${emitValue(fallback, environment)} END`;
  }
  if (name === "coalesce") {
    arityRange(expression.name, args, 1, Number.MAX_SAFE_INTEGER);
    if (args.length === 1)
      return emitValue(requiredArgument(args[0]), environment);
    const branches = args
      .slice(0, -1)
      .map(
        (arg) =>
          `WHEN ${emitValue(arg, environment)} IS NOT NULL THEN ${emitValue(arg, environment)}`,
      )
      .join(" ");
    return `CASE ${branches} ELSE ${emitValue(requiredArgument(args[args.length - 1]), environment)} END`;
  }
  if (name === "pick") {
    arityRange(expression.name, args, 2, Number.MAX_SAFE_INTEGER);
    const index = emitNumericArgument(requiredArgument(args[0]), environment);
    const branches = args
      .slice(1)
      .map((arg, position) => ({ arg, position }))
      .reverse()
      .map(
        ({ arg, position }) =>
          `WHEN ${index} = ${position + 1} THEN ${emitValue(arg, environment)}`,
      )
      .join(" ");
    return `CASE ${branches} ELSE NULL END`;
  }
  if (name === "class")
    return emitClassValue(expression.name, args, environment);
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} no tiene lowering condicional`,
    expression.name,
    0,
  );
}

export function emitConditionalNumeric(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const args = expression.args;
  if (name === "alt") {
    arityRange(expression.name, args, 2, Number.MAX_SAFE_INTEGER);
    const candidates = args.slice(0, -1);
    const fallback = requiredArgument(args[args.length - 1]);
    const branches = candidates
      .map((candidate) => {
        const numeric = emitNumericValue(candidate, environment);
        return `WHEN ${numeric} IS NOT NULL THEN ${numeric}`;
      })
      .join(" ");
    return `CASE ${branches} ELSE ${emitNumericValue(fallback, environment)} END`;
  }
  if (name === "coalesce") {
    arityRange(expression.name, args, 1, Number.MAX_SAFE_INTEGER);
    if (args.length === 1)
      return emitNumericValue(requiredArgument(args[0]), environment);
    const branches = args
      .slice(0, -1)
      .map(
        (arg) =>
          `WHEN ${emitValue(arg, environment)} IS NOT NULL THEN ${emitNumericValue(arg, environment)}`,
      )
      .join(" ");
    return `CASE ${branches} ELSE ${emitNumericValue(requiredArgument(args[args.length - 1]), environment)} END`;
  }
  if (name === "pick") {
    arityRange(expression.name, args, 2, Number.MAX_SAFE_INTEGER);
    const index = emitNumericArgument(requiredArgument(args[0]), environment);
    const branches = args
      .slice(1)
      .map((arg, position) => ({ arg, position }))
      .reverse()
      .map(
        ({ arg, position }) =>
          `WHEN ${index} = ${position + 1} THEN ${emitNumericValue(arg, environment)}`,
      )
      .join(" ");
    return `CASE ${branches} ELSE NULL END`;
  }
  if (name === "if") {
    arityRange(expression.name, args, 2, 3);
    const otherwise = args[2] ? emitNumericValue(args[2], environment) : "NULL";
    return `CASE WHEN ${emitCondition(requiredArgument(args[0]), environment)} THEN ${emitNumericValue(requiredArgument(args[1]), environment)} ELSE ${otherwise} END`;
  }
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} no tiene lowering numérico condicional`,
    expression.name,
    0,
  );
}

export function emitClassValue(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const parts = classParts(originalName, args, environment);
  return `CASE WHEN ${parts.valid} THEN CONCAT(CAST(${parts.lower} AS STRING), ${quoteString(` <= ${parts.label} < `)}, CAST(${parts.upper} AS STRING)) ELSE NULL END`;
}

export function emitClassNumeric(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const parts = classParts(originalName, args, environment);
  return `CASE WHEN ${parts.valid} THEN ${parts.lower} ELSE NULL END`;
}

export function classParts(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): { valid: string; lower: string; upper: string; label: string } {
  arityRange(originalName, args, 2, 4);
  const value = emitNumericArgument(requiredArgument(args[0]), environment);
  const interval = emitClassParameter(requiredArgument(args[1]), environment);
  const label = args[2] ? literalString(args[2], originalName) : "x";
  const offset = args[3] ? emitClassParameter(args[3], environment) : "0";
  const lower = `FLOOR((${value} - ${offset}) / ${interval}) * ${interval} + ${offset}`;
  const upper = `(${lower} + ${interval})`;
  const valid = `${value} IS NOT NULL AND ${interval} IS NOT NULL AND ${interval} > 0 AND ${offset} IS NOT NULL`;
  return { valid, lower, upper, label };
}

export function emitInterpretationValue(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const text = interpretationText(args, originalName, environment);
  const numeric = emitInterpretationNumeric(
    name,
    originalName,
    args,
    environment,
  );
  return `CASE WHEN ${numeric} IS NOT NULL THEN ${text} ELSE NULL END`;
}

export function emitInterpretationNumeric(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const text = interpretationText(args, originalName, environment);
  if (name === "date#") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.dateFormat ??
        fail(
          "DATE_FORMAT_ENV_REQUIRED",
          `${originalName} requiere DateFormat o un formato explícito`,
          originalName,
          0,
        ));
    const parsed = `SAFE.PARSE_DATE(${quoteString(translateQlikDateFormat(format, originalName))}, ${text})`;
    return `CAST(DATE_DIFF(${parsed}, DATE '1899-12-30', DAY) AS BIGNUMERIC)`;
  }
  if (name === "time#") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timeFormat ??
        fail(
          "TIME_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimeFormat o un formato explícito`,
          originalName,
          0,
        ));
    const parsed = `SAFE.PARSE_TIME(${quoteString(translateQlikTimeFormat(format, originalName))}, ${text})`;
    return `SAFE_DIVIDE(CAST(TIME_DIFF(${parsed}, TIME '00:00:00', MICROSECOND) AS BIGNUMERIC), 86400000000)`;
  }
  if (name === "timestamp#") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timestampFormat ??
        fail(
          "TIMESTAMP_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimestampFormat o un formato explícito`,
          originalName,
          0,
        ));
    const parsed = `SAFE.PARSE_TIMESTAMP(${quoteString(translateQlikTimestampFormat(format, originalName))}, ${text}, 'UTC')`;
    return qlikSerialFromTimestamp(parsed);
  }
  if (name === "num#" || name === "money#") {
    arityRange(originalName, args, 1, 4);
    const format = args[1] ? literalString(args[1], originalName) : undefined;
    if (format) translateQlikNumberFormat(format, originalName);
    const decimal = args[2]
      ? literalString(args[2], originalName)
      : (environment.decimalSep ?? ".");
    const thousand = args[3]
      ? literalString(args[3], originalName)
      : (environment.thousandSep ?? ",");
    if (!decimal || decimal === thousand)
      fail(
        "QLIK_NUMBER_SEPARATORS_INVALID",
        `${originalName} requiere separadores decimal y de millar distintos`,
        originalName,
        0,
      );
    const prefix = format?.match(/^[^0-9#.,]*/)?.[0] ?? "";
    const withoutPrefix = prefix
      ? `REPLACE(${text}, ${quoteString(prefix)}, '')`
      : text;
    const normalized = `REPLACE(REPLACE(${withoutPrefix}, ${quoteString(thousand)}, ''), ${quoteString(decimal)}, '.')`;
    return `SAFE_CAST(${normalized} AS BIGNUMERIC)`;
  }
  if (name === "interval#") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timeFormat ??
        fail(
          "TIME_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimeFormat o un formato explícito`,
          originalName,
          0,
        ));
    return parseQlikInterval(text, format, originalName);
  }
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${originalName} no tiene lowering de interpretación`,
    originalName,
    0,
  );
}

export function interpretationText(
  args: ExprQlik[],
  originalName: string,
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 1)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos un argumento`,
      originalName,
      0,
    );
  const value = requiredArgument(args[0]);
  return value.kind === "string"
    ? quoteString(value.value)
    : `CAST(${emitValue(value, environment)} AS STRING)`;
}

export function emitClassParameter(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  return expression.kind === "number"
    ? expression.raw
    : emitNumericArgument(expression, environment);
}

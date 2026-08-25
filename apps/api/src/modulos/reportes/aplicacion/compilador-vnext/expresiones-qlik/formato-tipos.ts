import { emitNumericArgument, emitValue } from "./core-valores.js";
import { DUAL_FUNCTIONS } from "./dual.js";
import { emitNum } from "./numero-formato.js";
import { emitDate } from "./temporal-calendario.js";
import {
  formatQlikInterval,
  formatQlikTime,
  formatQlikTimestamp,
  qlikTimeFromSerial,
  qlikTimestampFromSerial,
} from "./temporal-formato.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  literalString,
  requiredArgument,
} from "./utilidades.js";

export function emitFormattingValue(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (name === "date") {
    return emitDate(originalName, args, environment);
  }
  if (name === "num") {
    return emitNum(originalName, args, environment);
  }
  if (name === "dual") {
    arity(originalName, args, 2);
    return requiredArgument(args[0]).kind === "string"
      ? emitValue(requiredArgument(args[0]), environment)
      : `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  }
  if (name === "text") {
    arity(originalName, args, 1);
    return `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  }
  if (name === "money") {
    return emitNum(originalName, args, environment);
  }
  if (name === "time") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timeFormat ??
        fail(
          "TIME_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimeFormat para conservar el texto dual`,
          originalName,
          0,
        ));
    return formatQlikTime(
      qlikTimeFromSerial(
        emitNumericArgument(requiredArgument(args[0]), environment),
      ),
      format,
      originalName,
    );
  }
  if (name === "timestamp") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timestampFormat ??
        fail(
          "TIMESTAMP_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimestampFormat para conservar el texto dual`,
          originalName,
          0,
        ));
    return formatQlikTimestamp(
      qlikTimestampFromSerial(
        emitNumericArgument(requiredArgument(args[0]), environment),
      ),
      format,
      originalName,
    );
  }
  if (name === "interval") {
    arityRange(originalName, args, 1, 2);
    const format = args[1]
      ? literalString(args[1], originalName)
      : (environment.timeFormat ??
        fail(
          "TIME_FORMAT_ENV_REQUIRED",
          `${originalName} requiere TimeFormat para conservar el texto dual`,
          originalName,
          0,
        ));
    return formatQlikInterval(
      emitNumericArgument(requiredArgument(args[0]), environment),
      format,
      originalName,
    );
  }
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${originalName} no tiene lowering de formato`,
    originalName,
    0,
  );
}

export function emitColor(
  originalName: string,
  name: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const expected = name === "argb" ? 4 : 3;
  arity(originalName, args, expected);
  const values = args.map((arg) => emitNumericArgument(arg, environment));
  const valid = values
    .map(
      (value) =>
        `${value} IS NOT NULL AND ${value} = TRUNC(${value}) AND ${value} BETWEEN 0 AND 255`,
    )
    .join(" AND ");
  if (name === "hsl") {
    const [hue, saturation, lightness] = values;
    const chroma = `(1 - ABS(2 * (${lightness}) - 1)) * (${saturation})`;
    const segment = `MOD((${hue}) * 6, 6)`;
    const x = `(${chroma}) * (1 - ABS(MOD(${segment}, 2) - 1))`;
    const redPrime = `CASE WHEN ${segment} < 1 THEN ${chroma} WHEN ${segment} < 2 THEN ${x} WHEN ${segment} < 4 THEN 0 WHEN ${segment} < 5 THEN ${x} ELSE ${chroma} END`;
    const greenPrime = `CASE WHEN ${segment} < 1 THEN ${x} WHEN ${segment} < 3 THEN ${chroma} WHEN ${segment} < 4 THEN ${x} ELSE 0 END`;
    const bluePrime = `CASE WHEN ${segment} < 2 THEN 0 WHEN ${segment} < 3 THEN ${x} WHEN ${segment} < 5 THEN ${chroma} ELSE ${x} END`;
    const match = `(${lightness}) - (${chroma}) / 2`;
    const red = `ROUND((${redPrime} + ${match}) * 255)`;
    const green = `ROUND((${greenPrime} + ${match}) * 255)`;
    const blue = `ROUND((${bluePrime} + ${match}) * 255)`;
    const packed = `(255 * 16777216 + ${red} * 65536 + ${green} * 256 + ${blue})`;
    const hslValid = `${values.map((value) => `${value} IS NOT NULL`).join(" AND ")} AND ${hue} BETWEEN 0 AND 1 AND ${saturation} BETWEEN 0 AND 1 AND ${lightness} BETWEEN 0 AND 1`;
    return `CASE WHEN ${hslValid} THEN ${packed} ELSE NULL END`;
  }
  const alpha = name === "argb" ? requiredArgument(values[0]) : "255";
  const red =
    name === "argb" ? requiredArgument(values[1]) : requiredArgument(values[0]);
  const green =
    name === "argb" ? requiredArgument(values[2]) : requiredArgument(values[1]);
  const blue =
    name === "argb" ? requiredArgument(values[3]) : requiredArgument(values[2]);
  return `CASE WHEN ${valid} THEN (${alpha} * 16777216 + ${red} * 65536 + ${green} * 256 + ${blue} + 0 * 16711935) ELSE NULL END`;
}

export function emitCombinatoric(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (name === "fact") {
    arity(originalName, args, 1);
    const value = emitNumericArgument(requiredArgument(args[0]), environment);
    const integer = `CAST(TRUNC(${value}) AS INT64)`;
    const product = productOverRange("1", integer);
    return `CASE WHEN ${value} IS NULL OR TRUNC(${value}) <= 0 THEN NULL ELSE CAST(ROUND(${product}) AS BIGNUMERIC) END`;
  }
  arity(originalName, args, 2);
  const p = emitNumericArgument(requiredArgument(args[0]), environment);
  const q = emitNumericArgument(requiredArgument(args[1]), environment);
  const pInteger = `CAST(TRUNC(${p}) AS INT64)`;
  const qInteger = `CAST(TRUNC(${q}) AS INT64)`;
  const product = productOverRange(`(${pInteger} - ${qInteger} + 1)`, pInteger);
  const denominator = name === "combin" ? productOverRange("1", qInteger) : "1";
  const result = `SAFE_DIVIDE(${product}, ${denominator})`;
  return `CASE WHEN ${p} IS NULL OR ${q} IS NULL OR TRUNC(${p}) < 0 OR TRUNC(${q}) < 0 OR TRUNC(${q}) > TRUNC(${p}) THEN NULL ELSE CAST(ROUND(${result}) AS BIGNUMERIC) END`;
}

export function productOverRange(start: string, end: string): string {
  return `(SELECT COALESCE(EXP(SUM(LN(CAST(value AS FLOAT64)))), 1) FROM UNNEST(GENERATE_ARRAY(CAST(${start} AS INT64), CAST(${end} AS INT64))) AS value)`;
}

export function emitTypePredicate(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const value = emitValue(requiredArgument(args[0]), environment);
  const numeric = emitNumericArgument(requiredArgument(args[0]), environment);
  if (name === "isnum") {
    if (isForcedText(requiredArgument(args[0])))
      return `CASE WHEN ${value} IS NULL THEN 0 ELSE 0 END`;
    return `CASE WHEN ${value} IS NULL THEN 0 WHEN ${numeric} IS NOT NULL THEN -1 ELSE 0 END`;
  }
  if (hasTextRepresentation(requiredArgument(args[0]), environment))
    return `CASE WHEN ${value} IS NULL THEN 0 WHEN ${value} IS NOT NULL THEN -1 ELSE 0 END`;
  return `CASE WHEN ${value} IS NULL THEN 0 WHEN ${numeric} IS NULL THEN -1 ELSE 0 END`;
}

export function isForcedText(expression: ExprQlik): boolean {
  return expression.kind === "call" && expression.name.toLowerCase() === "text";
}

export function hasTextRepresentation(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): boolean {
  if (expression.kind === "string") return true;
  if (
    expression.kind === "identifier" &&
    environment.dualComponents?.[expression.name]
  )
    return true;
  if (expression.kind !== "call") return false;
  return (
    DUAL_FUNCTIONS.has(expression.name.toLowerCase()) ||
    expression.name.toLowerCase() === "text"
  );
}

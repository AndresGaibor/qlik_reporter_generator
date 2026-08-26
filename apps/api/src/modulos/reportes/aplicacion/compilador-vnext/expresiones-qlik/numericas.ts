import { qlikTimestampFromAny } from "./conversiones.js";
import { emitNumericArgument } from "./core-valores.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, requiredArgument } from "./utilidades.js";

export function qlikNumeric(sql: string): string {
  return `SAFE_CAST(CAST(${sql} AS STRING) AS BIGNUMERIC)`;
}

export function qlikNumericOrTemporal(sql: string): string {
  const numeric = qlikNumeric(sql);
  const timestamp = qlikTimestampFromAny(sql);
  return `COALESCE(${numeric}, ${qlikSerialFromTimestamp(timestamp)})`;
}

export function qlikSerialFromTimestamp(timestamp: string): string {
  return `SAFE_DIVIDE(CAST(TIMESTAMP_DIFF(${timestamp}, TIMESTAMP '1899-12-30 00:00:00+00', MICROSECOND) AS BIGNUMERIC), 86400000000)`;
}

export function emitDiv(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(requiredArgument(args[0]), environment);
  const right = emitNumericArgument(requiredArgument(args[1]), environment);
  return `CAST(TRUNC(SAFE_DIVIDE(${left}, ${right})) AS INT64)`;
}

export function emitMod(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(requiredArgument(args[0]), environment);
  const right = emitNumericArgument(requiredArgument(args[1]), environment);
  return `CASE WHEN ${left} IS NULL OR ${right} IS NULL OR ${left} != TRUNC(${left}) OR ${right} != TRUNC(${right}) OR ${right} <= 0 THEN NULL ELSE CAST(${left} - ${right} * FLOOR(${left} / ${right}) AS INT64) END`;
}

export function emitFmod(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(requiredArgument(args[0]), environment);
  const right = emitNumericArgument(requiredArgument(args[1]), environment);
  const quotient = `SAFE_DIVIDE(${left}, ${right})`;
  return `CASE WHEN ${left} IS NULL OR ${right} IS NULL OR ${right} = 0 THEN NULL ELSE ${left} - ${right} * TRUNC(${quotient}) END`;
}

export function emitFrac(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const value = emitNumericArgument(requiredArgument(args[0]), environment);
  return `CASE WHEN ${value} IS NULL THEN NULL ELSE ${value} - FLOOR(${value}) END`;
}

export function emitParity(
  kind: "even" | "odd",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const value = emitNumericArgument(requiredArgument(args[0]), environment);
  const parity = kind === "even" ? "0" : "1";
  return `CASE WHEN ${value} IS NULL OR ${value} != TRUNC(${value}) THEN NULL WHEN ${value} = 0 THEN -1 WHEN MOD(ABS(CAST(${value} AS INT64)), 2) = ${parity} THEN -1 ELSE 0 END`;
}

export function emitBitCount(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const numeric = emitNumericArgument(requiredArgument(args[0]), environment);
  const integer = `SAFE_CAST(${numeric} AS INT64)`;
  return `CASE WHEN ${numeric} IS NULL OR ${numeric} != TRUNC(${numeric}) OR ${integer} IS NULL THEN NULL ELSE BIT_COUNT(${integer} & 4294967295) END`;
}

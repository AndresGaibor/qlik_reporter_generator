import type { ExprQlik } from "../expresiones-qlik.js";
import type { ContextoEstadistica } from "./tipos.js";
import {
  distinctPrefix,
  requireArity,
  requiredArgument,
} from "./validacion.js";

export function emitBinomFrequency(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 3, context);
  const k = context.emitNumeric(requiredArgument(args, 0, context));
  const n = context.emitNumeric(requiredArgument(args, 1, context));
  const p = context.emitNumeric(requiredArgument(args, 2, context));
  const pmf = binomPmf("__K__", "__N__", "__P__");
  return `(SELECT CASE WHEN ${k} IS NULL OR ${n} IS NULL OR ${p} IS NULL OR ${k} != TRUNC(${k}) OR ${n} != TRUNC(${n}) OR ${n} < 0 OR ${k} < 0 OR ${k} > ${n} OR ${p} < 0 OR ${p} > 1 THEN NULL WHEN ${p} = 0 THEN IF(${k} = 0, 1, 0) WHEN ${p} = 1 THEN IF(${k} = ${n}, 1, 0) ELSE ${pmf} END)`
    .replaceAll("__K__", `CAST(${k} AS FLOAT64)`)
    .replaceAll("__N__", `CAST(${n} AS FLOAT64)`)
    .replaceAll("__P__", `CAST(${p} AS FLOAT64)`);
}

export function emitBinomDist(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 3, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const n = context.emitNumeric(requiredArgument(args, 1, context));
  const p = context.emitNumeric(requiredArgument(args, 2, context));
  const upper = `LEAST(${n}, FLOOR(${value}))`;
  const term = binomPmf("i", "__N__", "__P__")
    .replaceAll("__N__", `CAST(${n} AS FLOAT64)`)
    .replaceAll("__P__", `CAST(${p} AS FLOAT64)`);
  return `CASE WHEN ${value} IS NULL OR ${n} IS NULL OR ${p} IS NULL OR ${n} != TRUNC(${n}) OR ${n} < 0 OR ${p} < 0 OR ${p} > 1 THEN NULL WHEN ${value} < 0 THEN 0 WHEN ${value} >= ${n} THEN 1 WHEN ${p} = 0 THEN 1 WHEN ${p} = 1 THEN IF(FLOOR(${value}) >= ${n}, 1, 0) ELSE (SELECT SUM(${term}) FROM UNNEST(GENERATE_ARRAY(0, CAST(${upper} AS INT64))) AS i) END`;
}

export function binomPmf(k: string, n: string, p: string): string {
  const coefficient = `(SELECT EXP(COALESCE(SUM(LN(SAFE_DIVIDE(${n} - ${k} + j, j))), 0)) FROM UNNEST(GENERATE_ARRAY(1, CAST(${k} AS INT64))) AS j)`;
  return `(${coefficient} * POW(${p}, ${k}) * POW(1 - ${p}, ${n} - ${k}))`;
}

export function emitPoissonFrequency(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 2, context);
  const k = context.emitNumeric(requiredArgument(args, 0, context));
  const mean = context.emitNumeric(requiredArgument(args, 1, context));
  const factorial = `(SELECT EXP(COALESCE(SUM(LN(j)), 0)) FROM UNNEST(GENERATE_ARRAY(1, CAST(${k} AS INT64))) AS j)`;
  return `CASE WHEN ${k} IS NULL OR ${mean} IS NULL OR ${k} != TRUNC(${k}) OR ${k} < 0 OR ${mean} < 0 THEN NULL WHEN ${mean} = 0 THEN IF(${k} = 0, 1, 0) ELSE SAFE_DIVIDE(EXP(-${mean}) * POW(${mean}, ${k}), ${factorial}) END`;
}

export function emitPoissonDist(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 2, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const mean = context.emitNumeric(requiredArgument(args, 1, context));
  const upper = `FLOOR(${value})`;
  const factorial =
    "(SELECT EXP(COALESCE(SUM(LN(j)), 0)) FROM UNNEST(GENERATE_ARRAY(1, i)) AS j)";
  const term = `SAFE_DIVIDE(EXP(-${mean}) * POW(${mean}, i), ${factorial})`;
  return `CASE WHEN ${value} IS NULL OR ${mean} IS NULL OR ${mean} < 0 THEN NULL WHEN ${value} < 0 THEN 0 WHEN ${mean} = 0 THEN 1 ELSE (SELECT SUM(${term}) FROM UNNEST(GENERATE_ARRAY(0, CAST(${upper} AS INT64))) AS i) END`;
}

export function emitFractile(
  name: string,
  exclusive: boolean,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 2, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const probability = context.emitNumeric(requiredArgument(args, 1, context));
  const distinct = "";
  const ordered = `ARRAY_AGG(${distinct}${value} IGNORE NULLS ORDER BY ${value})`;
  const count = `COUNT(${distinct}${value})`;
  const rank = exclusive ? "P * (N + 1) - 1" : "P * (N - 1)";
  return `(SELECT CASE WHEN N = 0 OR P IS NULL OR P < 0 OR P > 1 OR R < 0 OR R > N - 1 THEN NULL WHEN FLOOR(R) = CEIL(R) THEN ordered_values[SAFE_OFFSET(CAST(R AS INT64))] ELSE ordered_values[SAFE_OFFSET(CAST(FLOOR(R) AS INT64))] + (R - FLOOR(R)) * (ordered_values[SAFE_OFFSET(CAST(CEIL(R) AS INT64))] - ordered_values[SAFE_OFFSET(CAST(FLOOR(R) AS INT64))]) END FROM (SELECT ${ordered} AS ordered_values, ${count} AS N, ANY_VALUE(${probability}) AS P) base CROSS JOIN (SELECT ${rank} AS R FROM (SELECT ${ordered} AS ordered_values, ${count} AS N, ANY_VALUE(${probability}) AS P)) rank_values)`;
}

export function emitMedian(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 1, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  return `(SELECT CASE WHEN N = 0 THEN NULL WHEN MOD(N, 2) = 1 THEN ordered_values[SAFE_OFFSET(DIV(N, 2))] ELSE (ordered_values[SAFE_OFFSET(DIV(N, 2) - 1)] + ordered_values[SAFE_OFFSET(DIV(N, 2))]) / 2 END FROM (SELECT ARRAY_AGG(${value} IGNORE NULLS ORDER BY ${value}) AS ordered_values, COUNT(${value}) AS N))`;
}

export function emitSterr(
  name: string,
  args: ExprQlik[],
  modifiers: readonly string[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 1, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const distinct = distinctPrefix(modifiers);
  return `SAFE_DIVIDE(STDDEV_SAMP(${distinct}${value}), SQRT(COUNT(${distinct}${value})))`;
}

export function emitMoment(
  name: string,
  kind: string,
  args: ExprQlik[],
  modifiers: readonly string[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 1, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const distinct = distinctPrefix(modifiers);
  const values = `UNNEST(ARRAY_AGG(${distinct}${value} IGNORE NULLS)) AS sample_value`;
  const moments = `(SELECT COUNT(*) AS N, STDDEV_SAMP(sample_value) AS S, SUM(POW(sample_value - mean_value, ${kind === "skew" ? 3 : 4})) AS M FROM (SELECT sample_value, AVG(sample_value) OVER() AS mean_value FROM ${values}))`;
  if (kind === "skew")
    return `(SELECT CASE WHEN N < 3 OR S IS NULL OR S = 0 THEN NULL ELSE SAFE_DIVIDE(N * M, (N - 1) * (N - 2) * POW(S, 3)) END FROM ${moments})`;
  return `(SELECT CASE WHEN N < 4 OR S IS NULL OR S = 0 THEN NULL ELSE SAFE_DIVIDE(N * (N + 1) * M, (N - 1) * (N - 2) * (N - 3) * POW(S, 4)) - SAFE_DIVIDE(3 * POW(N - 1, 2), (N - 2) * (N - 3)) END FROM ${moments})`;
}

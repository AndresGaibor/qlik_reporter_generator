import type { ExprQlik } from "./expresiones-qlik.js";

export type ClasificacionFuncionEstadistica =
  | "native_bigquery"
  | "sql_formula"
  | "udf_required"
  | "external_non_equivalent";

export interface ContextoEstadistica {
  emitValue(expression: ExprQlik): string;
  emitNumeric(expression: ExprQlik): string;
  fail(code: string, message: string): never;
}

const nativeNames = ["Correl", "Stdev"] as const;

const sqlFormulaNames = [
  "BinomDist",
  "BinomFrequency",
  "PoissonDist",
  "PoissonFrequency",
  "Chi2Test_chi2",
  "Chi2Test_df",
  "Fractile",
  "FractileExc",
  "Kurtosis",
  "LINEST_B",
  "LINEST_DF",
  "LINEST_F",
  "LINEST_M",
  "LINEST_R2",
  "LINEST_SEB",
  "LINEST_SEM",
  "LINEST_SEY",
  "LINEST_SSREG",
  "LINEST_SSRESID",
  "Median",
  "Skew",
  "Sterr",
  "STEYX",
  "TTest1_df",
  "TTest1_dif",
  "TTest1_sterr",
  "TTest1_t",
  "TTest1w_df",
  "TTest1w_dif",
  "TTest1w_sterr",
  "TTest1w_t",
  "TTest_df",
  "TTest_dif",
  "TTest_sterr",
  "TTest_t",
  "TTestw_df",
  "TTestw_dif",
  "TTestw_sterr",
  "TTestw_t",
  "ZTest_dif",
  "ZTest_sterr",
  "ZTest_z",
  "ZTestw_dif",
  "ZTestw_sterr",
  "ZTestw_z",
] as const;

const udfNames = [
  "BetaDensity",
  "BetaDist",
  "BetaInv",
  "BinomInv",
  "ChiDensity",
  "ChiDist",
  "ChiInv",
  "FDensity",
  "FDist",
  "FInv",
  "GammaDensity",
  "GammaDist",
  "GammaInv",
  "NormDist",
  "NormInv",
  "PoissonInv",
  "TDensity",
  "TDist",
  "TInv",
  "TTest1_conf",
  "TTest1_lower",
  "TTest1_sig",
  "TTest1_upper",
  "TTest1w_conf",
  "TTest1w_lower",
  "TTest1w_sig",
  "TTest1w_upper",
  "TTest_conf",
  "TTest_lower",
  "TTest_sig",
  "TTest_upper",
  "TTestw_conf",
  "TTestw_lower",
  "TTestw_sig",
  "TTestw_upper",
  "ZTest_conf",
  "ZTest_lower",
  "ZTest_sig",
  "ZTest_upper",
  "ZTestw_conf",
  "ZTestw_lower",
  "ZTestw_sig",
  "ZTestw_upper",
  "Chi2Test_p",
] as const;

const externalNames = ["MutualInfo"] as const;

export const ESTADISTICA_NATIVE_BIGQUERY = new Set<string>(nativeNames);
export const ESTADISTICA_SQL_FORMULA = new Set<string>(sqlFormulaNames);
export const ESTADISTICA_UDF_REQUIRED = new Set<string>(udfNames);
export const ESTADISTICA_EXTERNAL_NON_EQUIVALENT = new Set<string>(
  externalNames,
);

const classifications = new Map<string, ClasificacionFuncionEstadistica>([
  ...nativeNames.map(
    (name) => [name.toLowerCase(), "native_bigquery"] as const,
  ),
  ...sqlFormulaNames.map(
    (name) => [name.toLowerCase(), "sql_formula"] as const,
  ),
  ...udfNames.map((name) => [name.toLowerCase(), "udf_required"] as const),
  ...externalNames.map(
    (name) => [name.toLowerCase(), "external_non_equivalent"] as const,
  ),
]);

export function esFuncionEstadistica(name: string): boolean {
  return classifications.has(name.toLowerCase());
}

export function clasificarFuncionEstadistica(
  name: string,
): ClasificacionFuncionEstadistica | undefined {
  return classifications.get(name.toLowerCase());
}

export function emitirFuncionEstadistica(
  name: string,
  args: ExprQlik[],
  modifiers: readonly string[],
  context: ContextoEstadistica,
): string {
  const key = name.toLowerCase();
  const classification = classifications.get(key);
  if (!classification)
    return context.fail(
      "STATISTICS_UNKNOWN_FUNCTION",
      `${name} no pertenece al conjunto estadístico dedicado`,
    );
  if (classification === "udf_required")
    return context.fail(
      "STATISTICS_REQUIRES_EXACT_UDF",
      `${name} requiere una UDF exacta: BigQuery no expone la CDF/inversa o la función especial equivalente sin aproximar`,
    );
  if (classification === "external_non_equivalent")
    return context.fail(
      "STATISTICS_EXTERNAL_NON_EQUIVALENT",
      `${name} requiere la semántica estadística externa de Qlik y no tiene un equivalente BigQuery exacto`,
    );

  validateModifiers(
    name,
    modifiers,
    key === "stdev" || key === "kurtosis" || key === "skew" || key === "sterr",
    context,
  );

  if (key === "correl") {
    requireArity(name, args, 2, context);
    return `CORR(${context.emitNumeric(requiredArgument(args, 0, context))}, ${context.emitNumeric(requiredArgument(args, 1, context))})`;
  }
  if (key === "stdev") {
    requireArity(name, args, 1, context);
    return `STDDEV_SAMP(${distinctPrefix(modifiers)}${context.emitNumeric(requiredArgument(args, 0, context))})`;
  }
  if (key === "binomfrequency") return emitBinomFrequency(name, args, context);
  if (key === "binomdist") return emitBinomDist(name, args, context);
  if (key === "poissonfrequency")
    return emitPoissonFrequency(name, args, context);
  if (key === "poissondist") return emitPoissonDist(name, args, context);
  if (key === "fractile" || key === "fractileexc")
    return emitFractile(name, key === "fractileexc", args, context);
  if (key === "median") return emitMedian(name, args, context);
  if (key === "sterr") return emitSterr(name, args, modifiers, context);
  if (key === "skew" || key === "kurtosis")
    return emitMoment(name, key, args, modifiers, context);
  if (key.startsWith("linest_"))
    return emitLinest(name, key.slice("linest_".length), args, context);
  if (key === "steyx") return emitLinest(name, "sey", args, context);
  if (key.startsWith("ttest1w_"))
    return emitOneSampleWeightedTest(
      name,
      key.slice("ttest1w_".length),
      args,
      context,
    );
  if (key.startsWith("ttest1_"))
    return emitOneSampleTest(name, key.slice("ttest1_".length), args, context);
  if (key.startsWith("ttestw_"))
    return emitTwoSampleTest(
      name,
      key.slice("ttestw_".length),
      args,
      true,
      context,
    );
  if (key.startsWith("ttest_"))
    return emitTwoSampleTest(
      name,
      key.slice("ttest_".length),
      args,
      false,
      context,
    );
  if (key.startsWith("ztestw_"))
    return emitZTest(name, key.slice("ztestw_".length), args, true, context);
  if (key.startsWith("ztest_"))
    return emitZTest(name, key.slice("ztest_".length), args, false, context);
  if (key === "chi2test_chi2" || key === "chi2test_df")
    return emitChi2(name, key.endsWith("_df"), args, context);
  return context.fail(
    "STATISTICS_IMPLEMENTATION_MISSING",
    `${name} está clasificada como estadística exacta pero no tiene lowering`,
  );
}

function validateModifiers(
  name: string,
  modifiers: readonly string[],
  allowDistinct: boolean,
  context: ContextoEstadistica,
): void {
  if (modifiers.includes("total"))
    context.fail(
      "STATISTICS_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${name} TOTAL requiere el ámbito Qlik explícito`,
    );
  if (modifiers.includes("distinct") && !allowDistinct)
    context.fail(
      "STATISTICS_DISTINCT_NOT_SUPPORTED",
      `${name} no documenta DISTINCT en su firma Qlik`,
    );
}

function requireArity(
  name: string,
  args: ExprQlik[],
  expected: number,
  context: ContextoEstadistica,
): void {
  if (args.length !== expected)
    context.fail(
      "FUNCTION_ARITY",
      `${name} requiere ${expected} argumentos y recibió ${args.length}`,
    );
}

function requireArityRange(
  name: string,
  args: ExprQlik[],
  min: number,
  max: number,
  context: ContextoEstadistica,
): void {
  if (args.length < min || args.length > max)
    context.fail(
      "FUNCTION_ARITY",
      `${name} requiere entre ${min} y ${max} argumentos y recibió ${args.length}`,
    );
}

function requiredArgument(
  args: ExprQlik[],
  index: number,
  context: ContextoEstadistica,
): ExprQlik {
  const argument = args[index];
  if (argument) return argument;
  return context.fail(
    "FUNCTION_ARITY",
    `Falta el argumento estadístico ${index + 1}`,
  );
}

function distinctPrefix(modifiers: readonly string[]): string {
  return modifiers.includes("distinct") ? "DISTINCT " : "";
}

function emitBinomFrequency(
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

function emitBinomDist(
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

function binomPmf(k: string, n: string, p: string): string {
  const coefficient = `(SELECT EXP(COALESCE(SUM(LN(SAFE_DIVIDE(${n} - ${k} + j, j))), 0)) FROM UNNEST(GENERATE_ARRAY(1, CAST(${k} AS INT64))) AS j)`;
  return `(${coefficient} * POW(${p}, ${k}) * POW(1 - ${p}, ${n} - ${k}))`;
}

function emitPoissonFrequency(
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

function emitPoissonDist(
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

function emitFractile(
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

function emitMedian(
  name: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 1, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  return `(SELECT CASE WHEN N = 0 THEN NULL WHEN MOD(N, 2) = 1 THEN ordered_values[SAFE_OFFSET(DIV(N, 2))] ELSE (ordered_values[SAFE_OFFSET(DIV(N, 2) - 1)] + ordered_values[SAFE_OFFSET(DIV(N, 2))]) / 2 END FROM (SELECT ARRAY_AGG(${value} IGNORE NULLS ORDER BY ${value}) AS ordered_values, COUNT(${value}) AS N))`;
}

function emitSterr(
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

function emitMoment(
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

function emitLinest(
  name: string,
  metric: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArityRange(name, args, 2, 4, context);
  if (args.length === 3)
    context.fail(
      "STATISTICS_CONSTRAINT_PAIR_REQUIRED",
      `${name} requiere y0 y x0 juntos para fijar la recta`,
    );
  const yRaw = context.emitNumeric(requiredArgument(args, 0, context));
  const xRaw = context.emitNumeric(requiredArgument(args, 1, context));
  const constrained = args.length === 4;
  const y0 = constrained
    ? context.emitNumeric(requiredArgument(args, 2, context))
    : "0";
  const x0 = constrained
    ? context.emitNumeric(requiredArgument(args, 3, context))
    : "0";
  const y = constrained ? `(${yRaw} - ${y0})` : yRaw;
  const x = constrained ? `(${xRaw} - ${x0})` : xRaw;
  const pairs = `UNNEST(ARRAY_AGG(IF(${yRaw} IS NOT NULL AND ${xRaw} IS NOT NULL, STRUCT(${y} AS y, ${x} AS x), NULL) IGNORE NULLS)) AS pair`;
  const n = "COUNT(*)";
  const ssx = constrained
    ? "SUM(POW(pair.x, 2))"
    : "(COUNT(*) - 1) * VAR_SAMP(pair.x)";
  const slope = constrained
    ? "SAFE_DIVIDE(SUM(pair.x * pair.y), SUM(POW(pair.x, 2)))"
    : "SAFE_DIVIDE(COVAR_SAMP(pair.y, pair.x), VAR_SAMP(pair.x))";
  const intercept = constrained
    ? `${y0} - (${slope}) * ${x0}`
    : `AVG(pair.y) - (${slope}) * AVG(pair.x)`;
  const ssreg = `(${slope}) * (${slope}) * (${ssx})`;
  const ssresid = constrained
    ? "SUM(POW(pair.y, 2)) - SAFE_DIVIDE(POW(SUM(pair.x * pair.y), 2), SUM(POW(pair.x, 2)))"
    : `(${n} - 1) * VAR_SAMP(pair.y) - (${ssreg})`;
  const df = constrained ? "COUNT(*) - 1" : "COUNT(*) - 2";
  const sey = `SQRT(SAFE_DIVIDE(${ssresid}, ${df}))`;
  const sem = `SQRT(SAFE_DIVIDE(${ssresid}, ${df}) / (${ssx}))`;
  const seb = constrained
    ? `ABS(${x0}) * (${sem})`
    : `(${sey}) * SQRT(SAFE_DIVIDE(1, ${n}) + SAFE_DIVIDE(POW(AVG(pair.x), 2), ${ssx}))`;
  const source = "(SELECT ";
  const from = ` FROM ${pairs})`;
  switch (metric) {
    case "m":
      return `${source}${slope}${from}`;
    case "b":
      return `${source}${intercept}${from}`;
    case "df":
      return `${source}CASE WHEN COUNT(*) < ${constrained ? 2 : 3} THEN NULL ELSE ${df} END${from}`;
    case "f":
      return `${source}SAFE_DIVIDE(POW(CORR(pair.y, pair.x), 2), 1 - POW(CORR(pair.y, pair.x), 2))${from}`;
    case "r2":
      return `${source}POW(CORR(pair.y, pair.x), 2)${from}`;
    case "seb":
      return `${source}${seb}${from}`;
    case "sem":
      return `${source}${sem}${from}`;
    case "sey":
      return `${source}${sey}${from}`;
    case "ssreg":
      return `${source}${ssreg}${from}`;
    case "ssresid":
      return `${source}${ssresid}${from}`;
    default:
      return context.fail(
        "STATISTICS_IMPLEMENTATION_MISSING",
        `${name} no tiene métrica LINEST reconocida`,
      );
  }
}

function emitOneSampleTest(
  name: string,
  metric: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 1, context);
  const value = context.emitNumeric(requiredArgument(args, 0, context));
  const n = `COUNT(${value})`;
  const dif = `AVG(${value})`;
  const sterr = `SAFE_DIVIDE(STDDEV_SAMP(${value}), SQRT(${n}))`;
  if (metric === "df") return `CASE WHEN ${n} < 2 THEN NULL ELSE ${n} - 1 END`;
  if (metric === "dif") return dif;
  if (metric === "sterr") return sterr;
  if (metric === "t") return `SAFE_DIVIDE(${dif}, ${sterr})`;
  return context.fail(
    "STATISTICS_IMPLEMENTATION_MISSING",
    `${name} no tiene métrica de una muestra reconocida`,
  );
}

function emitOneSampleWeightedTest(
  name: string,
  metric: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArity(name, args, 2, context);
  const weight = context.emitNumeric(requiredArgument(args, 0, context));
  const value = context.emitNumeric(requiredArgument(args, 1, context));
  const pair = `${weight} IS NOT NULL AND ${value} IS NOT NULL`;
  const invalidWeight = `(${weight} <= 0 OR ${weight} != TRUNC(${weight}))`;
  const rows = `UNNEST(ARRAY_AGG(IF(${pair}, STRUCT(${weight} AS weight, ${value} AS value, ${invalidWeight} AS invalid_weight), NULL) IGNORE NULLS)) AS sample`;
  const invalid = "COUNTIF(sample.invalid_weight)";
  const validWeight = "NOT sample.invalid_weight";
  const total = `SUM(IF(${validWeight}, sample.weight, 0))`;
  const weightedSum = `SUM(IF(${validWeight}, sample.weight * sample.value, 0))`;
  const weightedSquareSum = `SUM(IF(${validWeight}, sample.weight * sample.value * sample.value, 0))`;
  const mean = `SAFE_DIVIDE(${weightedSum}, ${total})`;
  const variance = `SAFE_DIVIDE(${weightedSquareSum} - SAFE_DIVIDE(POW(${weightedSum}, 2), ${total}), ${total} - 1)`;
  const sterr = `SQRT(SAFE_DIVIDE(${variance}, ${total}))`;
  const source = `(SELECT CASE WHEN ${invalid} > 0 OR ${total} <= 1 THEN NULL ELSE `;
  const end = ` END FROM ${rows})`;
  if (metric === "df") return `${source}${total} - 1${end}`;
  if (metric === "dif") return `${source}${mean}${end}`;
  if (metric === "sterr") return `${source}${sterr}${end}`;
  if (metric === "t") return `${source}SAFE_DIVIDE(${mean}, ${sterr})${end}`;
  return context.fail(
    "STATISTICS_IMPLEMENTATION_MISSING",
    `${name} no tiene métrica ponderada reconocida`,
  );
}

function emitTwoSampleTest(
  name: string,
  metric: string,
  args: ExprQlik[],
  weighted: boolean,
  context: ContextoEstadistica,
): string {
  if (weighted) requireArityRange(name, args, 3, 4, context);
  else requireArityRange(name, args, 2, 3, context);
  const group = context.emitValue(
    requiredArgument(args, weighted ? 1 : 0, context),
  );
  const value = context.emitNumeric(
    requiredArgument(args, weighted ? 2 : 1, context),
  );
  const weight = weighted
    ? context.emitNumeric(requiredArgument(args, 0, context))
    : "1";
  const pair = weighted
    ? `${group} IS NOT NULL AND ${value} IS NOT NULL AND ${weight} IS NOT NULL`
    : `${group} IS NOT NULL AND ${value} IS NOT NULL`;
  const invalidWeight = weighted
    ? `(${weight} <= 0 OR ${weight} != TRUNC(${weight}))`
    : "FALSE";
  const rows = `UNNEST(ARRAY_AGG(IF(${pair}, STRUCT(${group} AS group_value, ${value} AS value, ${weight} AS weight, ${invalidWeight} AS invalid_weight), NULL) IGNORE NULLS)) AS sample`;
  const condition = "ARRAY_LENGTH(labels) = 2";
  const rowTable = "sample_rows";
  const n0 = weighted
    ? `SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.weight, 0))`
    : `COUNTIF(${rowTable}.group_value = labels[SAFE_OFFSET(0)])`;
  const n1 = weighted
    ? `SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.weight, 0))`
    : `COUNTIF(${rowTable}.group_value = labels[SAFE_OFFSET(1)])`;
  const mean0 = weighted
    ? `SAFE_DIVIDE(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.weight * ${rowTable}.value, 0)), ${n0})`
    : `AVG(IF(${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.value, NULL))`;
  const mean1 = weighted
    ? `SAFE_DIVIDE(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.weight * ${rowTable}.value, 0)), ${n1})`
    : `AVG(IF(${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.value, NULL))`;
  const var0 = weighted
    ? `SAFE_DIVIDE(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.weight * ${rowTable}.value * ${rowTable}.value, 0)) - SAFE_DIVIDE(POW(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.weight * ${rowTable}.value, 0)), 2), ${n0}), ${n0} - 1)`
    : `VAR_SAMP(IF(${rowTable}.group_value = labels[SAFE_OFFSET(0)], ${rowTable}.value, NULL))`;
  const var1 = weighted
    ? `SAFE_DIVIDE(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.weight * ${rowTable}.value * ${rowTable}.value, 0)) - SAFE_DIVIDE(POW(SUM(IF(NOT ${rowTable}.invalid_weight AND ${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.weight * ${rowTable}.value, 0)), 2), ${n1}), ${n1} - 1)`
    : `VAR_SAMP(IF(${rowTable}.group_value = labels[SAFE_OFFSET(1)], ${rowTable}.value, NULL))`;
  const equalVariance = args[weighted ? 3 : 2]
    ? context.emitNumeric(requiredArgument(args, weighted ? 3 : 2, context))
    : "0";
  const dif = `(${mean0}) - (${mean1})`;
  const stderr =
    "CASE WHEN equal_variance = 1 THEN SQRT(SAFE_DIVIDE((n0 - 1) * var0 + (n1 - 1) * var1, n0 + n1 - 2) * (SAFE_DIVIDE(1, n0) + SAFE_DIVIDE(1, n1))) ELSE SQRT(SAFE_DIVIDE(var0, n0) + SAFE_DIVIDE(var1, n1)) END";
  const df =
    "CASE WHEN equal_variance = 1 THEN n0 + n1 - 2 ELSE SAFE_DIVIDE(POW(SAFE_DIVIDE(var0, n0) + SAFE_DIVIDE(var1, n1), 2), SAFE_DIVIDE(POW(SAFE_DIVIDE(var0, n0), 2), n0 - 1) + SAFE_DIVIDE(POW(SAFE_DIVIDE(var1, n1), 2), n1 - 1)) END";
  const body =
    metric === "dif"
      ? "mean0 - mean1"
      : metric === "sterr"
        ? stderr
        : metric === "t"
          ? `SAFE_DIVIDE(mean0 - mean1, ${stderr})`
          : metric === "df"
            ? df
            : undefined;
  if (!body)
    return context.fail(
      "STATISTICS_IMPLEMENTATION_MISSING",
      `${name} no tiene métrica de dos muestras reconocida`,
    );
  return `(WITH sample_rows AS (SELECT * FROM ${rows}), labels AS (SELECT ARRAY_AGG(DISTINCT IF(invalid_weight, NULL, group_value) IGNORE NULLS ORDER BY IF(invalid_weight, NULL, group_value)) AS labels FROM sample_rows), sample_stats AS (SELECT ${condition} AS two_groups, COUNTIF(sample_rows.invalid_weight) AS invalid_weights, ${n0} AS n0, ${n1} AS n1, ${mean0} AS mean0, ${mean1} AS mean1, ${var0} AS var0, ${var1} AS var1, ${equalVariance} AS equal_variance FROM sample_rows CROSS JOIN labels) SELECT CASE WHEN invalid_weights > 0 OR NOT two_groups OR n0 <= 1 OR n1 <= 1 THEN NULL ELSE ${body} END FROM sample_stats)`;
}

function emitZTest(
  name: string,
  metric: string,
  args: ExprQlik[],
  weighted: boolean,
  context: ContextoEstadistica,
): string {
  if (weighted) requireArityRange(name, args, 2, 3, context);
  else requireArityRange(name, args, 1, 2, context);
  const value = context.emitNumeric(
    requiredArgument(args, weighted ? 1 : 0, context),
  );
  const weight = weighted
    ? context.emitNumeric(requiredArgument(args, 0, context))
    : "1";
  const explicitSigma = args[weighted ? 2 : 1]
    ? context.emitNumeric(requiredArgument(args, weighted ? 2 : 1, context))
    : undefined;
  const pair = weighted
    ? `${weight} IS NOT NULL AND ${value} IS NOT NULL`
    : `${value} IS NOT NULL`;
  const invalidWeight = weighted
    ? `(${weight} <= 0 OR ${weight} != TRUNC(${weight}))`
    : "FALSE";
  const rows = `UNNEST(ARRAY_AGG(IF(${pair}, STRUCT(${value} AS value, ${weight} AS weight, ${invalidWeight} AS invalid_weight), NULL) IGNORE NULLS)) AS sample`;
  const invalid = "COUNTIF(sample.invalid_weight)";
  const total = weighted
    ? "SUM(IF(NOT sample.invalid_weight, sample.weight, 0))"
    : "COUNT(sample.value)";
  const mean = weighted
    ? `SAFE_DIVIDE(SUM(IF(NOT sample.invalid_weight, sample.weight * sample.value, 0)), ${total})`
    : "AVG(sample.value)";
  const sigma =
    explicitSigma ??
    (weighted
      ? `SQRT(SAFE_DIVIDE(SUM(IF(NOT sample.invalid_weight, sample.weight * sample.value * sample.value, 0)) - SAFE_DIVIDE(POW(SUM(IF(NOT sample.invalid_weight, sample.weight * sample.value, 0)), 2), ${total}), ${total} - 1))`
      : "STDDEV_SAMP(sample.value)");
  const sterr = `SAFE_DIVIDE(${sigma}, SQRT(${total}))`;
  const prefix = `(SELECT CASE WHEN ${invalid} > 0 OR ${total} <= 0 THEN NULL ELSE `;
  const suffix = ` END FROM ${rows})`;
  if (metric === "dif") return `${prefix}${mean}${suffix}`;
  if (metric === "sterr") return `${prefix}${sterr}${suffix}`;
  if (metric === "z") return `${prefix}SAFE_DIVIDE(${mean}, ${sterr})${suffix}`;
  return context.fail(
    "STATISTICS_IMPLEMENTATION_MISSING",
    `${name} no tiene métrica z reconocida`,
  );
}

function emitChi2(
  name: string,
  dfOnly: boolean,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArityRange(name, args, 3, 4, context);
  const col = context.emitValue(requiredArgument(args, 0, context));
  const row = context.emitValue(requiredArgument(args, 1, context));
  const actual = context.emitNumeric(requiredArgument(args, 2, context));
  const expected = args[3]
    ? context.emitNumeric(requiredArgument(args, 3, context))
    : undefined;
  const valid = `${col} IS NOT NULL AND ${row} IS NOT NULL AND ${actual} IS NOT NULL`;
  const rows = `UNNEST(ARRAY_AGG(IF(${valid}, STRUCT(${col} AS col, ${row} AS row, ${actual} AS actual${expected ? `, ${expected} AS expected` : ""}), NULL) IGNORE NULLS)) AS cell`;
  const groupedCells = expected
    ? `(SELECT cell.col AS col, cell.row AS row, SUM(cell.actual) AS actual, ANY_VALUE(cell.expected) AS expected FROM ${rows} GROUP BY cell.col, cell.row)`
    : `(SELECT cell.col AS col, cell.row AS row, SUM(cell.actual) AS actual FROM ${rows} GROUP BY cell.col, cell.row)`;
  if (dfOnly) {
    const source = `(SELECT COUNT(DISTINCT cell.col) - 1 FROM ${groupedCells} AS cell) * (SELECT COUNT(DISTINCT cell.row) - 1 FROM ${groupedCells} AS cell)`;
    return `CASE WHEN ${source} < 0 THEN NULL ELSE ${source} END`;
  }
  const expectedCell = expected
    ? "cell.expected"
    : "SAFE_DIVIDE(SUM(cell.actual) OVER (PARTITION BY cell.row) * SUM(cell.actual) OVER (PARTITION BY cell.col), SUM(cell.actual) OVER ())";
  const cellsWithExpected = `(SELECT cell.*, ${expectedCell} AS expected_cell FROM ${groupedCells} AS cell) AS statistic_cell`;
  return `(SELECT CASE WHEN COUNTIF(expected_cell IS NULL OR expected_cell <= 0) > 0 THEN NULL ELSE SUM(SAFE_DIVIDE(POW(actual - expected_cell, 2), expected_cell)) END FROM ${cellsWithExpected})`;
}

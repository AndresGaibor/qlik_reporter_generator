import type { ExprQlik } from "../expresiones-qlik.js";
import type { ContextoEstadistica } from "./tipos.js";
import {
  requireArity,
  requireArityRange,
  requiredArgument,
} from "./validacion.js";

export function emitOneSampleTest(
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

export function emitOneSampleWeightedTest(
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

export function emitTwoSampleTest(
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

export function emitZTest(
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

export function emitChi2(
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

import { qlikDateFromAny, qlikTimestampFromAny } from "./conversiones.js";
import { emitNumericValue, emitValue } from "./core-valores.js";
import {
  emitFiscalYearStart,
  emitHolidayDates,
  emitMonthsSegmentStart,
  firstFiscalMonth,
} from "./temporal-contexto.js";
import { formatDualDate, formatQlikTimestamp } from "./temporal-formato.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, arityRange, fail, requiredArgument } from "./utilidades.js";

export function emitInDay(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const timestamp = qlikTimestampFromAny(
    emitValue(requiredArgument(args[0]), environment),
  );
  const base = qlikTimestampFromAny(
    emitValue(requiredArgument(args[1]), environment),
  );
  const shift = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[2]), environment)}) AS INT64)`;
  const dayStart = args[3] ? emitNumericValue(args[3], environment) : "0";
  const offset = `CAST(ROUND((${dayStart}) * 86400000000) AS INT64)`;
  const baseShifted = `TIMESTAMP_SUB(${base}, INTERVAL ${offset} MICROSECOND)`;
  const start = `TIMESTAMP_ADD(TIMESTAMP_TRUNC(${baseShifted}, DAY, 'UTC'), INTERVAL ${offset} MICROSECOND)`;
  const shifted = `TIMESTAMP_ADD(${start}, INTERVAL ${shift} DAY)`;
  const end = `TIMESTAMP_ADD(${shifted}, INTERVAL 1 DAY)`;
  return `CASE WHEN ${timestamp} IS NULL OR ${base} IS NULL THEN NULL WHEN ${timestamp} >= ${shifted} AND ${timestamp} < ${end} THEN -1 ELSE 0 END`;
}

export function emitInMonths(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 4, 5);
  const months = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
  const timestamp = qlikTimestampFromAny(
    emitValue(requiredArgument(args[1]), environment),
  );
  const base = qlikDateFromAny(
    emitValue(requiredArgument(args[2]), environment),
  );
  const period = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[3]), environment)}) AS INT64)`;
  const firstMonth = firstFiscalMonth(args[4], environment, originalName);
  const start = emitMonthsSegmentStart(base, months, period, firstMonth);
  const end = `DATE_ADD(${start}, INTERVAL ${months} MONTH)`;
  return `CASE WHEN ${timestamp} IS NULL OR ${base} IS NULL OR ${months} NOT IN (1, 2, 3, 4, 6) THEN NULL WHEN ${timestamp} >= TIMESTAMP(${start}) AND ${timestamp} < TIMESTAMP(${end}) THEN -1 ELSE 0 END`;
}

export function emitInYearToDate(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const timestamp = qlikTimestampFromAny(
    emitValue(requiredArgument(args[0]), environment),
  );
  const base = qlikTimestampFromAny(
    emitValue(requiredArgument(args[1]), environment),
  );
  const period = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[2]), environment)}) AS INT64)`;
  const firstMonth = firstFiscalMonth(args[3], environment, originalName);
  const baseDate = `DATE(${base})`;
  const startDate = emitFiscalYearStart(baseDate, firstMonth);
  const start = `TIMESTAMP(DATE_ADD(${startDate}, INTERVAL ${period} YEAR))`;
  return `CASE WHEN ${timestamp} IS NULL OR ${base} IS NULL THEN NULL WHEN ${timestamp} >= ${start} AND ${timestamp} <= ${base} THEN -1 ELSE 0 END`;
}

export function emitNetworkDays(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 10);
  const start = qlikDateFromAny(
    emitValue(requiredArgument(args[0]), environment),
  );
  const end = qlikDateFromAny(
    emitValue(requiredArgument(args[1]), environment),
  );
  const holidays = emitHolidayDates(args.slice(2), originalName, environment);
  const low = `LEAST(${start}, ${end})`;
  const high = `GREATEST(${start}, ${end})`;
  const holidayPredicate =
    holidays.length === 0
      ? "TRUE"
      : `NOT EXISTS (SELECT 1 FROM UNNEST([${holidays.join(", ")}]) AS holiday WHERE holiday = day)`;
  const count = `(SELECT COUNTIF(EXTRACT(DAYOFWEEK FROM day) BETWEEN 2 AND 6 AND ${holidayPredicate}) FROM UNNEST(GENERATE_DATE_ARRAY(${low}, ${high})) AS day)`;
  return `CASE WHEN ${start} IS NULL OR ${end} IS NULL THEN NULL ELSE IF(${end} >= ${start}, 1, -1) * ${count} END`;
}

export function emitWorkDate(
  name: "firstworkdate" | "lastworkdate",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const date = emitWorkDateRaw(name, originalName, args, environment);
  return formatDualDate(date, environment, originalName);
}

export function emitWorkDateRaw(
  name: "firstworkdate" | "lastworkdate",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 10);
  const reference = qlikDateFromAny(
    emitValue(requiredArgument(args[0]), environment),
  );
  const workdays = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[1]), environment)}) AS INT64)`;
  const holidays = emitHolidayDates(args.slice(2), originalName, environment);
  const range =
    name === "firstworkdate"
      ? `GENERATE_DATE_ARRAY(DATE_SUB(${reference}, INTERVAL CAST((${workdays} * 7 + 7) AS INT64) DAY), ${reference})`
      : `GENERATE_DATE_ARRAY(${reference}, DATE_ADD(${reference}, INTERVAL CAST((${workdays} * 7 + 7) AS INT64) DAY))`;
  const order = name === "firstworkdate" ? "DESC" : "ASC";
  const holidayPredicate =
    holidays.length === 0
      ? "TRUE"
      : `NOT EXISTS (SELECT 1 FROM UNNEST([${holidays.join(", ")}]) AS holiday WHERE holiday = candidate)`;
  return `(SELECT ARRAY_AGG(candidate ORDER BY candidate ${order})[SAFE_OFFSET(${workdays} - 1)] FROM UNNEST(${range}) AS candidate WHERE EXTRACT(DAYOFWEEK FROM candidate) BETWEEN 2 AND 6 AND ${holidayPredicate})`;
}

export function emitSetDateYearMonth(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const timestamp = emitSetDateYearMonthRaw(originalName, args, environment);
  if (environment.timestampFormat)
    return formatQlikTimestamp(
      timestamp,
      environment.timestampFormat,
      originalName,
    );
  return formatDualDate(`DATE(${timestamp})`, environment, originalName);
}

export function emitSetDateYearMonthRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 3);
  const timestamp = qlikTimestampFromAny(
    emitValue(requiredArgument(args[0]), environment),
  );
  const year = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[1]), environment)}) AS INT64)`;
  const month = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[2]), environment)}) AS INT64)`;
  const day = `EXTRACT(DAY FROM ${timestamp})`;
  const date = `SAFE.PARSE_DATE('%Y-%m-%d', FORMAT('%04d-%02d-%02d', ${year}, ${month}, ${day}))`;
  return `TIMESTAMP(DATETIME(${date}, TIME(${timestamp})), 'UTC')`;
}

export function requireCurrentClockMode(
  expression: ExprQlik,
  functionName: string,
): void {
  if (
    expression.kind !== "number" ||
    !/^[+-]?\d+$/.test(expression.raw) ||
    Number(expression.raw) !== 1
  )
    fail(
      "TEMPORAL_RUNTIME_CONTEXT_REQUIRED",
      `${functionName} solo puede representar timer_mode=1 con el contexto de ejecución disponible`,
      functionName,
      0,
    );
}

export function emitClockTimestamp(
  name: "now" | "gmt" | "utc",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (name === "now") arityRange(originalName, args, 0, 1);
  else arity(originalName, args, 0);
  if (args[0]) requireCurrentClockMode(args[0], originalName);
  const timestamp = "CURRENT_TIMESTAMP()";
  return formatQlikTimestamp(
    timestamp,
    environment.timestampFormat ??
      fail(
        "TIMESTAMP_FORMAT_ENV_REQUIRED",
        `${originalName} requiere TimestampFormat para conservar el texto dual`,
        originalName,
        0,
      ),
    originalName,
  );
}

export function emitToday(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 0, 1);
  if (args[0]) requireCurrentClockMode(args[0], originalName);
  return formatDualDate("CURRENT_DATE('UTC')", environment, originalName);
}

export function emitUnsupportedTemporalRuntimeContext(
  originalName: string,
  args: ExprQlik[],
  name: string,
): never {
  if (name === "localtime") arityRange(originalName, args, 0, 2);
  else arityRange(originalName, args, 1, 3);
  fail(
    "TEMPORAL_RUNTIME_CONTEXT_REQUIRED",
    `${originalName} requiere el contexto de zona horaria de Qlik; BigQuery solo puede representarlo con una política/IANA explícita del runtime`,
    originalName,
    0,
  );
}

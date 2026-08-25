import { emitNumericValue, emitValue } from "./core-valores.js";
import {
  emitFiscalQuarterStart,
  emitFiscalYearStart,
  emitMonthNameCase,
  emitMonthsSegmentStart,
  firstFiscalMonth,
  formatDualDateWithQlikSerial,
  requireIsoWeekCalendar,
  requireIsoWeekStart,
  requireMonthNames,
} from "./temporal-contexto.js";
import { formatDualDate } from "./temporal-formato.js";
import { qlikDateFromTyped } from "./temporal-tipado.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, arityRange, requiredArgument } from "./utilidades.js";

export function emitAge(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const timestamp = typedDate(requiredArgument(args[0]), environment);
  const birth = typedDate(requiredArgument(args[1]), environment);
  const years = `DATE_DIFF(${timestamp}, ${birth}, YEAR)`;
  const anniversary = `DATE_ADD(${birth}, INTERVAL ${years} YEAR)`;
  return `CASE WHEN ${timestamp} IS NULL OR ${birth} IS NULL THEN NULL ELSE ${years} - IF(${anniversary} > ${timestamp}, 1, 0) END`;
}

export function emitDayNumber(
  name: "daynumberofyear" | "daynumberofquarter",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const date = typedDate(requiredArgument(args[0]), environment);
  const firstMonth = firstFiscalMonth(args[1], environment, originalName);
  const start =
    name === "daynumberofyear"
      ? emitFiscalYearStart(date, firstMonth)
      : emitFiscalQuarterStart(date, firstMonth);
  return `DATE_DIFF(${date}, ${start}, DAY) + 1`;
}

export function emitMonthName(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  requireMonthNames(originalName, environment);
  const start = emitMonthNameStart(originalName, args, environment);
  return `CONCAT(${emitMonthNameCase(start, environment)}, ' ', FORMAT_DATE('%Y', ${start}))`;
}

export function emitMonthNameStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const date = typedDate(requiredArgument(args[0]), environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  return `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL ${period} MONTH)`;
}

export function emitQuarterName(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  requireMonthNames(originalName, environment);
  const start = emitQuarterNameStart(originalName, args, environment);
  const end = `DATE_SUB(DATE_ADD(${start}, INTERVAL 3 MONTH), INTERVAL 1 DAY)`;
  return `CONCAT(${emitMonthNameCase(start, environment)}, '-', ${emitMonthNameCase(end, environment)}, ' ', FORMAT_DATE('%Y', ${start}))`;
}

export function emitQuarterNameStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const date = typedDate(requiredArgument(args[0]), environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const firstMonth = firstFiscalMonth(args[2], environment, originalName);
  return emitFiscalQuarterStart(date, firstMonth, period);
}

export function emitWeekName(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const start = emitWeekNameStart(originalName, args, environment);
  return `FORMAT('%04d/%02d', EXTRACT(ISOYEAR FROM ${start}), EXTRACT(ISOWEEK FROM ${start}))`;
}

export function emitWeekNameStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 5);
  requireIsoWeekCalendar(originalName, args, environment, 2);
  const date = typedDate(requiredArgument(args[0]), environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const monday = `DATE_SUB(${date}, INTERVAL MOD(EXTRACT(DAYOFWEEK FROM ${date}) + 5, 7) DAY)`;
  return `DATE_ADD(${monday}, INTERVAL ${period} WEEK)`;
}

export function emitYearName(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const start = emitYearNameStart(originalName, args, environment);
  const firstMonth = firstFiscalMonth(args[2], environment, originalName);
  const nextYear = `DATE_SUB(DATE_ADD(${start}, INTERVAL 1 YEAR), INTERVAL 1 DAY)`;
  const year = `FORMAT_DATE('%Y', ${start})`;
  const nextYearLabel = `FORMAT_DATE('%Y', ${nextYear})`;
  return `CASE WHEN ${firstMonth} = 1 THEN ${year} ELSE CONCAT(${year}, '-', ${nextYearLabel}) END`;
}

export function emitYearNameStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const date = typedDate(requiredArgument(args[0]), environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const firstMonth = firstFiscalMonth(args[2], environment, originalName);
  const start = emitFiscalYearStart(date, firstMonth);
  return `DATE_ADD(${start}, INTERVAL ${period} YEAR)`;
}

export function emitWeekBoundary(
  name: "weekstart" | "weekend",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (name === "weekstart") {
    const start = emitWeekStart(originalName, args, environment);
    return formatDualDate(start, environment, originalName);
  }
  const end = emitWeekEndTimestamp(originalName, args, environment);
  return formatDualDate(`DATE(${end})`, environment, originalName);
}

export function emitWeekStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  requireIsoWeekStart(originalName, args[2], environment);
  const date = typedDate(requiredArgument(args[0]), environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const monday = `DATE_SUB(${date}, INTERVAL MOD(EXTRACT(DAYOFWEEK FROM ${date}) + 5, 7) DAY)`;
  return `DATE_ADD(${monday}, INTERVAL ${period} WEEK)`;
}

export function emitWeekEndTimestamp(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const start = emitWeekStart(originalName, args, environment);
  return `TIMESTAMP_SUB(TIMESTAMP(DATE_ADD(${start}, INTERVAL 1 WEEK)), INTERVAL 1 MILLISECOND)`;
}

export function emitMakeWeekDate(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const date = emitMakeWeekDateRaw(originalName, args, environment);
  return formatDualDate(date, environment, originalName);
}

export function emitMakeWeekDateRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 6);
  requireIsoWeekCalendar(originalName, args, environment, 3);
  const year = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
  const week = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "1";
  const day = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "0";
  const firstWeek = `DATE_TRUNC(SAFE.PARSE_DATE('%Y-%m-%d', FORMAT('%04d-01-04', ${year})), ISOWEEK)`;
  const offset = `(${week} - 1) * 7 + ${day}`;
  return `DATE_ADD(${firstWeek}, INTERVAL CAST(${offset} AS INT64) DAY)`;
}

export function emitMonthsBoundary(
  name: "monthsstart" | "monthsend",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const start = emitMonthsStart(originalName, args, environment);
  if (name === "monthsstart")
    return formatDualDateWithQlikSerial(start, environment, originalName);
  const end = emitMonthsEndTimestamp(originalName, args, environment);
  return formatDualDate(`DATE(${end})`, environment, originalName);
}

export function emitMonthsStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 4);
  const date = typedDate(requiredArgument(args[1]), environment);
  const months = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
  const period = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "0";
  const firstMonth = firstFiscalMonth(args[3], environment, originalName);
  const start = emitMonthsSegmentStart(date, months, period, firstMonth);
  return `CASE WHEN ${months} IN (1, 2, 3, 4, 6) THEN ${start} ELSE NULL END`;
}

export function emitMonthsEndTimestamp(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 4);
  const start = emitMonthsStart(originalName, args, environment);
  const months = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
  return `TIMESTAMP_SUB(TIMESTAMP(DATE_ADD(${start}, INTERVAL ${months} MONTH)), INTERVAL 1 MILLISECOND)`;
}

function typedDate(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  return qlikDateFromTyped(
    expression,
    emitValue(expression, environment),
    environment,
  );
}

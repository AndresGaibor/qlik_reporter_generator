import { qlikDateFromAny, translateQlikDateFormat } from "./conversiones.js";
import { emitNumericValue, emitValue } from "./core-valores.js";
import { literalInteger } from "./temporal-calendario.js";
import { formatDualDate } from "./temporal-formato.js";
import { qlikDateFromTyped } from "./temporal-tipado.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arityRange,
  fail,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function requireMonthNames(
  originalName: string,
  environment: EntornoExpresionQlik,
): readonly string[] {
  if (!environment.monthNames || environment.monthNames.length !== 12)
    fail(
      "MONTH_NAMES_ENV_REQUIRED",
      `${originalName} requiere MonthNames con 12 valores para conservar el texto dual`,
      originalName,
      0,
    );
  return environment.monthNames;
}

export function formatDualDateWithQlikSerial(
  date: string,
  environment: EntornoExpresionQlik,
  functionName: string,
): string {
  const serial = `DATE_DIFF(${date}, DATE '1899-12-30', DAY)`;
  return `CASE WHEN ${serial} IS NULL THEN NULL ELSE ${formatDualDate(date, environment, functionName)} END`;
}

export function emitMonthNameCase(
  date: string,
  environment: EntornoExpresionQlik,
): string {
  const months = requireMonthNames("MonthName", environment);
  const cases = months
    .map((value, index) => `WHEN ${index + 1} THEN ${quoteString(value)}`)
    .join(" ");
  return `CASE EXTRACT(MONTH FROM ${date}) ${cases} END`;
}

export function firstFiscalMonth(
  expression: ExprQlik | undefined,
  environment: EntornoExpresionQlik,
  functionName: string,
): string {
  if (!expression) {
    const value = environment.firstMonthOfYear ?? 1;
    if (value < 1 || value > 12)
      fail(
        "TEMPORAL_FIRST_MONTH_INVALID",
        `${functionName} requiere first_month_of_year entre 1 y 12`,
        functionName,
        0,
      );
    return String(value);
  }
  if (expression.kind === "number" && /^[+-]?\d+$/.test(expression.raw)) {
    const value = Number(expression.raw);
    if (value < 1 || value > 12)
      fail(
        "TEMPORAL_FIRST_MONTH_INVALID",
        `${functionName} requiere first_month_of_year entre 1 y 12`,
        functionName,
        0,
      );
  }
  return `CAST(TRUNC(${emitNumericValue(expression, environment)}) AS INT64)`;
}

export function emitFiscalYearStart(date: string, firstMonth: string): string {
  const year = `CAST(EXTRACT(YEAR FROM ${date}) - IF(EXTRACT(MONTH FROM ${date}) < ${firstMonth}, 1, 0) AS INT64)`;
  return `SAFE.PARSE_DATE('%Y-%m-%d', FORMAT('%04d-%02d-01', ${year}, ${firstMonth}))`;
}

export function emitFiscalQuarterStart(
  date: string,
  firstMonth: string,
  period = "0",
): string {
  const yearStart = emitFiscalYearStart(date, firstMonth);
  const monthOffset = `MOD(EXTRACT(MONTH FROM ${date}) - ${firstMonth} + 12, 12)`;
  const quarterOffset = `FLOOR(${monthOffset} / 3) * 3 + (${period}) * 3`;
  return `DATE_ADD(${yearStart}, INTERVAL CAST(${quarterOffset} AS INT64) MONTH)`;
}

export function emitMonthsSegmentStart(
  date: string,
  months: string,
  period: string,
  firstMonth: string,
): string {
  const yearStart = emitFiscalYearStart(date, firstMonth);
  const monthOffset = `MOD(EXTRACT(MONTH FROM ${date}) - ${firstMonth} + 12, 12)`;
  const segmentOffset = `FLOOR(${monthOffset} / ${months}) * ${months} + (${period}) * ${months}`;
  return `DATE_ADD(${yearStart}, INTERVAL CAST(${segmentOffset} AS INT64) MONTH)`;
}

export function requireIsoWeekStart(
  functionName: string,
  firstWeekDayExpression: ExprQlik | undefined,
  environment: EntornoExpresionQlik,
): void {
  const firstWeekDay = firstWeekDayExpression
    ? literalInteger(firstWeekDayExpression, functionName)
    : environment.firstWeekDay;
  if (firstWeekDay === undefined)
    fail(
      "WEEK_ENV_REQUIRED",
      `${functionName} requiere FirstWeekDay para preservar el calendario Qlik`,
      functionName,
      0,
    );
  if (firstWeekDay < 0 || firstWeekDay > 6)
    fail(
      "WEEK_CONFIGURATION_INVALID",
      `${functionName} recibió FirstWeekDay inválido (${firstWeekDay})`,
      functionName,
      0,
    );
  if (firstWeekDay !== 0)
    fail(
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
      `${functionName} usa un primer día no-ISO (${firstWeekDay})`,
      functionName,
      0,
    );
}

export function requireIsoWeekCalendar(
  functionName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
  firstWeekDayIndex: number,
): void {
  const brokenWeeksIndex = firstWeekDayIndex + 1;
  const referenceDayIndex = firstWeekDayIndex + 2;
  const firstWeekArg = args[firstWeekDayIndex];
  const brokenWeeksArg = args[brokenWeeksIndex];
  const referenceDayArg = args[referenceDayIndex];
  const firstWeekDay = firstWeekArg
    ? literalInteger(firstWeekArg, functionName)
    : environment.firstWeekDay;
  const brokenWeeks = brokenWeeksArg
    ? literalInteger(brokenWeeksArg, functionName)
    : environment.brokenWeeks;
  const referenceDay = referenceDayArg
    ? literalInteger(referenceDayArg, functionName)
    : environment.referenceDay;
  if (
    firstWeekDay === undefined ||
    brokenWeeks === undefined ||
    referenceDay === undefined
  )
    fail(
      "WEEK_ENV_REQUIRED",
      `${functionName} requiere FirstWeekDay, BrokenWeeks y ReferenceDay para preservar el calendario Qlik`,
      functionName,
      0,
    );
  if (
    firstWeekDay < 0 ||
    firstWeekDay > 6 ||
    ![0, 1].includes(brokenWeeks) ||
    referenceDay < 1 ||
    referenceDay > 7
  )
    fail(
      "WEEK_CONFIGURATION_INVALID",
      `${functionName} recibió una configuración semanal inválida`,
      functionName,
      0,
    );
  if (firstWeekDay !== 0 || brokenWeeks !== 0 || referenceDay !== 4)
    fail(
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
      `${functionName} usa calendario Qlik no-ISO (${firstWeekDay},${brokenWeeks},${referenceDay})`,
      functionName,
      0,
    );
}

export function emitHolidayDates(
  expressions: ExprQlik[],
  functionName: string,
  environment: EntornoExpresionQlik,
): string[] {
  return expressions.map((expression) => {
    if (expression.kind !== "string")
      fail(
        "WORKDAY_HOLIDAY_LITERAL_REQUIRED",
        `${functionName} requiere que cada holiday sea un string literal`,
        functionName,
        0,
      );
    return qlikDateFromAny(quoteString(expression.value));
  });
}

export function emitMonthStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const qlikFormat =
    environment.dateFormat ??
    fail(
      "DATE_FORMAT_ENV_REQUIRED",
      `${originalName} requiere DateFormat para conservar el texto dual`,
      originalName,
      0,
    );
  const format = translateQlikDateFormat(qlikFormat, originalName);
  const argument = requiredArgument(args[0]);
  const date = qlikDateFromTyped(
    argument,
    emitValue(argument, environment),
    environment,
  );
  const period = args[1] ? emitValue(args[1], environment) : "0";
  const start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL CAST(${period} AS INT64) MONTH)`;
  return `FORMAT_DATE(${quoteString(format)}, ${start})`;
}

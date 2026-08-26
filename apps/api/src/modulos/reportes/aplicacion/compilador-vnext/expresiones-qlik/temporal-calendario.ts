import {
  qlikDateFromAny,
  qlikTimestampFromAny,
  translateQlikDateFormat,
} from "./conversiones.js";
import { emitNumericValue, emitValue } from "./core-valores.js";
import { formatDualDate } from "./temporal-formato.js";
import {
  qlikDateFromTyped,
  qlikTimestampFromTyped,
} from "./temporal-tipado.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  literalString,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitWeekPart(
  kind: "week" | "weekyear",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 4);
  const firstWeekDay = args[1]
    ? literalInteger(args[1], originalName)
    : environment.firstWeekDay;
  const brokenWeeks = args[2]
    ? literalInteger(args[2], originalName)
    : environment.brokenWeeks;
  const referenceDayRaw = args[3]
    ? literalInteger(args[3], originalName)
    : environment.referenceDay;
  if (
    firstWeekDay === undefined ||
    brokenWeeks === undefined ||
    referenceDayRaw === undefined
  )
    fail(
      "WEEK_ENV_REQUIRED",
      `${originalName} requiere FirstWeekDay, BrokenWeeks y ReferenceDay para preservar el calendario Qlik`,
      originalName,
      0,
    );
  if (firstWeekDay < 0 || firstWeekDay > 6 || ![0, 1].includes(brokenWeeks))
    fail(
      "WEEK_CONFIGURATION_INVALID",
      `${originalName} recibió FirstWeekDay/BrokenWeeks inválidos (${firstWeekDay},${brokenWeeks})`,
      originalName,
      0,
    );
  const referenceDay =
    referenceDayRaw >= 1 && referenceDayRaw <= 7 ? referenceDayRaw : 4;
  if (firstWeekDay !== 0 || brokenWeeks !== 0 || referenceDay !== 4)
    fail(
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
      `${originalName} usa calendario Qlik no-ISO (${firstWeekDay},${brokenWeeks},${referenceDayRaw})`,
      originalName,
      0,
    );
  const date = typedDateArgument(args, environment);
  return `EXTRACT(${kind === "week" ? "ISOWEEK" : "ISOYEAR"} FROM ${date})`;
}

export function literalInteger(
  expression: ExprQlik,
  functionName: string,
): number {
  if (expression.kind !== "number" || !/^[+-]?\d+$/.test(expression.raw))
    fail(
      "FUNCTION_LITERAL_INTEGER_REQUIRED",
      `${functionName} requiere un entero literal para esta configuración en esta fase`,
      functionName,
      0,
    );
  return Number(expression.raw);
}

export function emitQuarter(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const date = typedDateArgument(args, environment);
  if (!args[1]) return `EXTRACT(QUARTER FROM ${date})`;
  const firstMonth = `CAST(${emitValue(args[1], environment)} AS INT64)`;
  return `CASE WHEN ${firstMonth} BETWEEN 1 AND 12 THEN CAST(FLOOR(MOD(EXTRACT(MONTH FROM ${date}) - ${firstMonth} + 12, 12) / 3) + 1 AS INT64) ELSE NULL END`;
}

export function emitDate(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const qlikFormat = args[1]
    ? literalString(args[1], originalName)
    : (environment.dateFormat ??
      fail(
        "DATE_FORMAT_ENV_REQUIRED",
        `${originalName} requiere DateFormat o un formato explícito`,
        originalName,
        0,
      ));
  const format = translateQlikDateFormat(qlikFormat, originalName);
  const date = typedDateArgument(args, environment);
  return `FORMAT_DATE(${quoteString(format)}, ${date})`;
}

export function weekDayParts(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): { actual: string; numeric: string } {
  arityRange(originalName, args, 1, 2);
  const firstWeekDay = args[1]
    ? literalInteger(args[1], originalName)
    : environment.firstWeekDay;
  if (firstWeekDay === undefined || firstWeekDay < 0 || firstWeekDay > 6)
    fail(
      "WEEKDAY_ENV_REQUIRED",
      `${originalName} requiere FirstWeekDay entre 0 y 6`,
      originalName,
      0,
    );
  const date = typedDateArgument(args, environment);
  const actual = `MOD(EXTRACT(DAYOFWEEK FROM ${date}) + 5, 7)`;
  const numeric = `MOD(${actual} - ${firstWeekDay} + 7, 7)`;
  return { actual, numeric };
}

export function emitWeekDay(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (!environment.dayNames || environment.dayNames.length !== 7)
    fail(
      "DAY_NAMES_ENV_REQUIRED",
      `${originalName} requiere DayNames con 7 valores para conservar el texto dual`,
      originalName,
      0,
    );
  const { actual } = weekDayParts(originalName, args, environment);
  const cases = environment.dayNames
    .map((value, index) => `WHEN ${index} THEN ${quoteString(value)}`)
    .join(" ");
  return `CASE ${actual} ${cases} END`;
}

export function emitMonth(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  if (!environment.monthNames || environment.monthNames.length !== 12)
    fail(
      "MONTH_NAMES_ENV_REQUIRED",
      `${originalName} requiere MonthNames con 12 valores para conservar el texto dual`,
      originalName,
      0,
    );
  const date = typedDateArgument(args, environment);
  const cases = environment.monthNames
    .map((value, index) => `WHEN ${index + 1} THEN ${quoteString(value)}`)
    .join(" ");
  return `CASE EXTRACT(MONTH FROM ${date}) ${cases} END`;
}

export function emitDayBoundary(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const timestamp = emitDayBoundaryTimestamp(
    kind,
    originalName,
    args,
    environment,
  );
  const format =
    environment.timestampFormat ??
    fail(
      "TIMESTAMP_FORMAT_ENV_REQUIRED",
      `${originalName} requiere TimestampFormat para conservar el texto dual`,
      originalName,
      0,
    );
  if (format === "YYYY-MM-DD hh:mm:ss")
    return `FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', ${timestamp}, 'UTC')`;
  if (format === "M/D/YYYY h:mm:ss[.fff] TT") {
    const millis = `EXTRACT(MILLISECOND FROM ${timestamp} AT TIME ZONE 'UTC')`;
    return `FORMAT('%d/%d/%04d %d:%02d:%02d%s %s', EXTRACT(MONTH FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(DAY FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(YEAR FROM ${timestamp} AT TIME ZONE 'UTC'), IF(MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12) = 0, 12, MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12)), EXTRACT(MINUTE FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(SECOND FROM ${timestamp} AT TIME ZONE 'UTC'), IF(${millis} = 0, '', FORMAT('.%03d', ${millis})), IF(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC') < 12, 'AM', 'PM'))`;
  }
  fail(
    "QLIK_TIMESTAMP_FORMAT_NOT_IMPLEMENTED",
    `${originalName} usa un TimestampFormat Qlik aún no certificado: ${format}`,
    originalName,
    0,
  );
}

export function emitDayBoundaryTimestamp(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const timestamp = typedTimestampArgument(args, environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const dayStart = args[2] ? emitNumericValue(args[2], environment) : "0";
  const offsetMicros = `CAST(ROUND((${dayStart}) * 86400000000) AS INT64)`;
  const shifted = `TIMESTAMP_SUB(${timestamp}, INTERVAL ${offsetMicros} MICROSECOND)`;
  const base = `TIMESTAMP_ADD(TIMESTAMP_TRUNC(${shifted}, DAY, 'UTC'), INTERVAL ${offsetMicros} MICROSECOND)`;
  const start = `TIMESTAMP_ADD(${base}, INTERVAL ${period} DAY)`;
  if (kind === "daystart") return start;
  return `TIMESTAMP_SUB(TIMESTAMP_ADD(${start}, INTERVAL 1 DAY), INTERVAL 1 MILLISECOND)`;
}

export function emitPeriodBoundary(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const timestamp = emitPeriodBoundaryTimestamp(
    kind,
    originalName,
    args,
    environment,
  );
  return formatDualDate(`DATE(${timestamp})`, environment, originalName);
}

export function emitPeriodBoundaryTimestamp(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const isMonth = kind === "monthend";
  arityRange(originalName, args, 1, isMonth ? 2 : 3);
  const date = typedDateArgument(args, environment);
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";

  let start: string;
  let nextInterval: string;
  if (isMonth) {
    start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL ${period} MONTH)`;
    nextInterval = "INTERVAL 1 MONTH";
  } else {
    const firstMonth = args[2] ? literalInteger(args[2], originalName) : 1;
    if (firstMonth < 1 || firstMonth > 12)
      fail(
        "TEMPORAL_FIRST_MONTH_INVALID",
        `${originalName} requiere first_month_of_year entre 1 y 12`,
        originalName,
        0,
      );
    const shift = firstMonth - 1;
    const shifted =
      shift === 0 ? date : `DATE_SUB(${date}, INTERVAL ${shift} MONTH)`;
    const unit = kind.startsWith("quarter") ? "QUARTER" : "YEAR";
    const baseShifted = `DATE_TRUNC(${shifted}, ${unit})`;
    const base =
      shift === 0
        ? baseShifted
        : `DATE_ADD(${baseShifted}, INTERVAL ${shift} MONTH)`;
    if (unit === "QUARTER") {
      start = `DATE_ADD(${base}, INTERVAL CAST((${period}) * 3 AS INT64) MONTH)`;
      nextInterval = "INTERVAL 3 MONTH";
    } else {
      start = `DATE_ADD(${base}, INTERVAL ${period} YEAR)`;
      nextInterval = "INTERVAL 1 YEAR";
    }
  }

  if (kind.endsWith("start")) return `TIMESTAMP(${start})`;
  return `TIMESTAMP_SUB(TIMESTAMP(DATE_ADD(${start}, ${nextInterval})), INTERVAL 1 MILLISECOND)`;
}

function typedDateArgument(
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const argument = requiredArgument(args[0]);
  return qlikDateFromTyped(
    argument,
    emitValue(argument, environment),
    environment,
  );
}

function typedTimestampArgument(
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const argument = requiredArgument(args[0]);
  return qlikTimestampFromTyped(
    argument,
    emitValue(argument, environment),
    environment,
  );
}

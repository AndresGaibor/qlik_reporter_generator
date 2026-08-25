import { qlikDateFromAny, translateQlikDateFormat } from "./conversiones.js";
import { emitNumericValue, emitValue } from "./core-valores.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitMakeTimeRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const hour = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
  const minute = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const second = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "0";
  const encoded = `FORMAT('%02d:%02d:%02d', ${hour}, ${minute}, ${second})`;
  return `CASE WHEN ${hour} BETWEEN 0 AND 23 AND ${minute} BETWEEN 0 AND 59 AND ${second} BETWEEN 0 AND 59 THEN SAFE.PARSE_TIME('%H:%M:%S', ${encoded}) ELSE NULL END`;
}

export function emitMakeTime(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const time = emitMakeTimeRaw(originalName, args, environment);
  const format =
    environment.timeFormat ??
    fail(
      "TIME_FORMAT_ENV_REQUIRED",
      `${originalName} requiere TimeFormat para conservar el texto dual`,
      originalName,
      0,
    );
  return formatQlikTime(time, format, originalName);
}

export function formatQlikTime(
  time: string,
  format: string,
  functionName: string,
): string {
  if (format === "hh:mm:ss") return `FORMAT_TIME('%H:%M:%S', ${time})`;
  if (format === "hh:mm") return `FORMAT_TIME('%H:%M', ${time})`;
  if (format === "hh:mm:ss TT") return `FORMAT_TIME('%I:%M:%S %p', ${time})`;
  if (format === "hh:mm TT") return `FORMAT_TIME('%I:%M %p', ${time})`;
  if (format === "h:mm:ss")
    return `FORMAT('%d:%02d:%02d', EXTRACT(HOUR FROM ${time}), EXTRACT(MINUTE FROM ${time}), CAST(FLOOR(EXTRACT(SECOND FROM ${time})) AS INT64))`;
  if (format === "h:mm:ss TT")
    return `FORMAT('%d:%02d:%02d %s', IF(MOD(EXTRACT(HOUR FROM ${time}), 12) = 0, 12, MOD(EXTRACT(HOUR FROM ${time}), 12)), EXTRACT(MINUTE FROM ${time}), CAST(FLOOR(EXTRACT(SECOND FROM ${time})) AS INT64), IF(EXTRACT(HOUR FROM ${time}) < 12, 'AM', 'PM'))`;
  fail(
    "QLIK_TIME_FORMAT_NOT_IMPLEMENTED",
    `${functionName} usa un TimeFormat Qlik aún no certificado: ${format}`,
    functionName,
    0,
  );
}

export function translateQlikTimeFormat(
  format: string,
  functionName: string,
): string {
  const formats: Record<string, string> = {
    "hh:mm:ss": "%H:%M:%S",
    "hh:mm": "%H:%M",
    "hh:mm:ss TT": "%I:%M:%S %p",
    "hh:mm TT": "%I:%M %p",
    "h:mm:ss": "%H:%M:%S",
    "h:mm": "%H:%M",
    "h:mm:ss TT": "%I:%M:%S %p",
    "h:mm TT": "%I:%M %p",
  };
  const translated = formats[format];
  if (!translated)
    fail(
      "QLIK_TIME_FORMAT_NOT_IMPLEMENTED",
      `${functionName} usa un TimeFormat Qlik aún no certificado: ${format}`,
      functionName,
      0,
    );
  return translated;
}

export function qlikTimeFromSerial(numeric: string): string {
  const fraction = `MOD(MOD(${numeric}, 1) + 1, 1)`;
  const micros = `MOD(CAST(ROUND(${fraction} * 86400000000) AS INT64), 86400000000)`;
  return `TIME_ADD(TIME '00:00:00', INTERVAL ${micros} MICROSECOND)`;
}

export function qlikTimestampFromSerial(numeric: string): string {
  return `TIMESTAMP_ADD(TIMESTAMP '1899-12-30 00:00:00+00', INTERVAL CAST(ROUND((${numeric}) * 86400000000) AS INT64) MICROSECOND)`;
}

export function translateQlikTimestampFormat(
  format: string,
  functionName: string,
): string {
  const formats: Record<string, string> = {
    "YYYY-MM-DD hh:mm": "%Y-%m-%d %H:%M",
    "YYYY-MM-DD hh:mm:ss": "%Y-%m-%d %H:%M:%S",
    "YYYY-MM-DD hh:mm:ss.fff": "%Y-%m-%d %H:%M:%E*S",
    "DD-MM-YYYY hh:mm:ss": "%d-%m-%Y %H:%M:%S",
    "DD/MM/YYYY hh:mm:ss": "%d/%m/%Y %H:%M:%S",
    "hh:mm:ss TT": "%I:%M:%S %p",
    "hh:mm TT": "%I:%M %p",
  };
  const translated = formats[format];
  if (!translated)
    fail(
      "QLIK_TIMESTAMP_FORMAT_NOT_IMPLEMENTED",
      `${functionName} usa un TimestampFormat Qlik aún no certificado: ${format}`,
      functionName,
      0,
    );
  return translated;
}

export function formatQlikTimestamp(
  timestamp: string,
  format: string,
  functionName: string,
): string {
  let formatted: string;
  if (format === "M/D/YYYY h:mm:ss[.fff] TT") {
    const millis = `EXTRACT(MILLISECOND FROM ${timestamp} AT TIME ZONE 'UTC')`;
    formatted = `FORMAT('%d/%d/%04d %d:%02d:%02d%s %s', EXTRACT(MONTH FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(DAY FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(YEAR FROM ${timestamp} AT TIME ZONE 'UTC'), IF(MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12) = 0, 12, MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12)), EXTRACT(MINUTE FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(SECOND FROM ${timestamp} AT TIME ZONE 'UTC'), IF(${millis} = 0, '', FORMAT('.%03d', ${millis})), IF(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC') < 12, 'AM', 'PM'))`;
  } else {
    formatted = `FORMAT_TIMESTAMP(${quoteString(translateQlikTimestampFormat(format, functionName))}, ${timestamp}, 'UTC')`;
  }
  return `CASE WHEN ${timestamp} IS NULL THEN NULL ELSE ${formatted} END`;
}

export function formatQlikInterval(
  numeric: string,
  format: string,
  functionName: string,
): string {
  const sign = `IF(${numeric} < 0, '-', '')`;
  const absolute = `ABS(${numeric})`;
  const days = `CAST(FLOOR(${absolute}) AS INT64)`;
  const hours = `CAST(FLOOR(${absolute} * 24) AS INT64)`;
  const minutes = `CAST(FLOOR(${absolute} * 1440) AS INT64)`;
  const seconds = `CAST(FLOOR(${absolute} * 86400) AS INT64)`;
  const secondsInMinute = `MOD(${seconds}, 60)`;
  const minutesInHour = `MOD(${minutes}, 60)`;
  const hoursInDay = `MOD(${hours}, 24)`;
  let formatted: string;
  if (format === "hh:mm")
    formatted = `FORMAT('%s%02d:%02d', ${sign}, ${hours}, ${minutesInHour})`;
  else if (format === "hh:mm:ss")
    formatted = `FORMAT('%s%02d:%02d:%02d', ${sign}, ${hours}, ${minutesInHour}, ${secondsInMinute})`;
  else if (format === "d hh")
    formatted = `FORMAT('%s%d %02d', ${sign}, ${days}, ${hoursInDay})`;
  else if (format === "d hh:mm")
    formatted = `FORMAT('%s%d %02d:%02d', ${sign}, ${days}, ${hoursInDay}, ${minutesInHour})`;
  else if (format === "d hh:mm:ss")
    formatted = `FORMAT('%s%d %02d:%02d:%02d', ${sign}, ${days}, ${hoursInDay}, ${minutesInHour}, ${secondsInMinute})`;
  else
    fail(
      "QLIK_INTERVAL_FORMAT_NOT_IMPLEMENTED",
      `${functionName} usa un formato de intervalo Qlik aún no certificado: ${format}`,
      functionName,
      0,
    );
  return `CASE WHEN ${numeric} IS NULL THEN NULL ELSE ${formatted} END`;
}

export function parseQlikInterval(
  text: string,
  format: string,
  functionName: string,
): string {
  if (format === "hh:mm" || format === "hh:mm:ss") {
    const withSeconds = format === "hh:mm:ss";
    const valid = withSeconds
      ? `REGEXP_CONTAINS(${text}, r'^-?\\d+:\\d{2}:\\d{2}$')`
      : `REGEXP_CONTAINS(${text}, r'^-?\\d+:\\d{2}$')`;
    const unsigned = `REGEXP_REPLACE(${text}, r'^-', '')`;
    const hour = `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^(\\d+):') AS BIGNUMERIC)`;
    const minute = `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^\\d+:(\\d{2})') AS BIGNUMERIC)`;
    const second = withSeconds
      ? `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^\\d+:\\d{2}:(\\d{2})$') AS BIGNUMERIC)`
      : "0";
    const total = `SAFE_DIVIDE(${hour}, 24) + SAFE_DIVIDE(${minute}, 1440) + SAFE_DIVIDE(${second}, 86400)`;
    const sign = `IF(REGEXP_CONTAINS(${text}, r'^-'), -1, 1)`;
    return `CASE WHEN ${text} IS NULL OR NOT ${valid} THEN NULL ELSE SAFE_CAST(${sign} * (${total}) AS BIGNUMERIC) END`;
  }
  if (format === "d hh" || format === "d hh:mm" || format === "d hh:mm:ss") {
    const withMinutes = format !== "d hh";
    const withSeconds = format === "d hh:mm:ss";
    const pattern = withSeconds
      ? `r'^-?\\d+\\s+\\d{2}:\\d{2}:\\d{2}$'`
      : withMinutes
        ? `r'^-?\\d+\\s+\\d{2}:\\d{2}$'`
        : `r'^-?\\d+\\s+\\d{2}$'`;
    const valid = `REGEXP_CONTAINS(${text}, ${pattern})`;
    const unsigned = `REGEXP_REPLACE(${text}, r'^-', '')`;
    const day = `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^(\\d+)\\s+') AS BIGNUMERIC)`;
    const hour = `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^\\d+\\s+(\\d{2})') AS BIGNUMERIC)`;
    const minute = withMinutes
      ? `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^\\d+\\s+\\d{2}:(\\d{2})') AS BIGNUMERIC)`
      : "0";
    const second = withSeconds
      ? `SAFE_CAST(REGEXP_EXTRACT(${unsigned}, r'^\\d+\\s+\\d{2}:\\d{2}:(\\d{2})$') AS BIGNUMERIC)`
      : "0";
    const total = `${day} + SAFE_DIVIDE(${hour}, 24) + SAFE_DIVIDE(${minute}, 1440) + SAFE_DIVIDE(${second}, 86400)`;
    const sign = `IF(REGEXP_CONTAINS(${text}, r'^-'), -1, 1)`;
    return `CASE WHEN ${text} IS NULL OR NOT ${valid} THEN NULL ELSE SAFE_CAST(${sign} * (${total}) AS BIGNUMERIC) END`;
  }
  fail(
    "QLIK_INTERVAL_FORMAT_NOT_IMPLEMENTED",
    `${functionName} usa un formato de intervalo Qlik aún no certificado: ${format}`,
    functionName,
    0,
  );
}

export function formatDualDate(
  date: string,
  environment: EntornoExpresionQlik,
  functionName: string,
): string {
  const qlikFormat =
    environment.dateFormat ??
    fail(
      "DATE_FORMAT_ENV_REQUIRED",
      `${functionName} requiere DateFormat para conservar el texto dual`,
      functionName,
      0,
    );
  return `FORMAT_DATE(${quoteString(translateQlikDateFormat(qlikFormat, functionName))}, ${date})`;
}

export function emitDualDateRaw(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (kind === "makedate") {
    arityRange(originalName, args, 1, 3);
    const year = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[0]), environment)}) AS INT64)`;
    const month = args[1]
      ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
      : "1";
    const day = args[2]
      ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
      : "1";
    return `SAFE.PARSE_DATE('%Y-%m-%d', FORMAT('%04d-%02d-%02d', ${year}, ${month}, ${day}))`;
  }
  if (kind === "addyears") {
    arity(originalName, args, 2);
    const date = qlikDateFromAny(
      emitValue(requiredArgument(args[0]), environment),
    );
    const years = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[1]), environment)}) AS INT64)`;
    return `DATE_ADD(${date}, INTERVAL ${years} YEAR)`;
  }
  if (kind === "addmonths") {
    arityRange(originalName, args, 2, 3);
    const date = qlikDateFromAny(
      emitValue(requiredArgument(args[0]), environment),
    );
    const months = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[1]), environment)}) AS INT64)`;
    const mode = args[2] ? emitNumericValue(args[2], environment) : "0";
    const normal = `DATE_ADD(${date}, INTERVAL ${months} MONTH)`;
    const targetMonth = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL ${months} MONTH)`;
    const relativeEnd = `DATE_SUB(LAST_DAY(${targetMonth}), INTERVAL DATE_DIFF(LAST_DAY(${date}), ${date}, DAY) DAY)`;
    return `CASE WHEN ${mode} = 1 AND EXTRACT(DAY FROM ${date}) >= 28 THEN ${relativeEnd} ELSE ${normal} END`;
  }
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${originalName} no tiene construcción de fecha dual`,
    originalName,
    0,
  );
}

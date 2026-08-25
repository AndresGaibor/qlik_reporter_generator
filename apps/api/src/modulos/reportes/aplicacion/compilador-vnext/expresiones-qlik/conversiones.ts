import { fail } from "./utilidades.js";

export function qlikDateFromAny(sql: string): string {
  const text = `CAST(${sql} AS STRING)`;
  const number = `SAFE_CAST(${text} AS FLOAT64)`;
  return `COALESCE(SAFE_CAST(${text} AS DATE), DATE(SAFE_CAST(${text} AS TIMESTAMP)), DATE_ADD(DATE '1899-12-30', INTERVAL CAST(FLOOR(${number}) AS INT64) DAY))`;
}

export function qlikTimestampFromAny(sql: string): string {
  const text = `CAST(${sql} AS STRING)`;
  const number = `SAFE_CAST(${text} AS FLOAT64)`;
  const timeOnly = `TIMESTAMP(DATETIME(DATE '1899-12-30', SAFE_CAST(${text} AS TIME)), 'UTC')`;
  const serial = `TIMESTAMP_ADD(TIMESTAMP '1899-12-30 00:00:00+00', INTERVAL CAST(ROUND(${number} * 86400000000) AS INT64) MICROSECOND)`;
  return `COALESCE(SAFE_CAST(${text} AS TIMESTAMP), TIMESTAMP(SAFE_CAST(${text} AS DATE)), ${timeOnly}, ${serial})`;
}

export function translateQlikDateFormat(
  format: string,
  functionName: string,
): string {
  const formats: Record<string, string> = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "M/D/YYYY": "%m/%d/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM-DD-YYYY": "%m-%d-%Y",
    "YY.MM.DD": "%y.%m.%d",
    "DD.MM.YYYY": "%d.%m.%Y",
    "MM/YYYY": "%m/%Y",
  };
  const translated = formats[format];
  if (!translated)
    fail(
      "QLIK_DATE_FORMAT_NOT_IMPLEMENTED",
      `${functionName} usa un formato Qlik aún no certificado: ${format}`,
      functionName,
      0,
    );
  return translated;
}

export function translateQlikNumberFormat(
  format: string,
  functionName: string,
): string {
  const match = format.match(/^(#,##)?0(?:\.(0+))?$/);
  if (!match)
    fail(
      "QLIK_NUMBER_FORMAT_NOT_IMPLEMENTED",
      `${functionName} usa un formato Qlik aún no certificado: ${format}`,
      functionName,
      0,
    );
  const grouped = Boolean(match[1]);
  const decimals = match[2]?.length ?? 0;
  const integer = grouped
    ? `${Array.from({ length: 24 }, () => "999").join("G")}G990`
    : `${"9".repeat(74)}0`;
  return `FM${integer}${decimals > 0 ? `D${"0".repeat(decimals)}` : ""}`;
}

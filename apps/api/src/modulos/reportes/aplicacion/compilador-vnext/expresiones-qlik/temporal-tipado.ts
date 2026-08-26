import { qlikDateFromAny, qlikTimestampFromAny } from "./conversiones.js";
import { tipoCampoBigQuery } from "./tipado-campos.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";

export function qlikDateFromTyped(
  expression: ExprQlik,
  sql: string,
  environment: EntornoExpresionQlik,
): string {
  const type = tipoIdentificador(expression, environment);
  if (type === "DATE") return sql;
  if (type === "DATETIME") return `DATE(${sql})`;
  if (type === "TIMESTAMP") return `DATE(${sql}, 'UTC')`;
  return qlikDateFromAny(sql);
}

export function qlikDateExtractSource(
  expression: ExprQlik,
  sql: string,
  environment: EntornoExpresionQlik,
): string {
  const type = tipoIdentificador(expression, environment);
  if (type === "DATE" || type === "DATETIME") return sql;
  if (type === "TIMESTAMP") return `${sql} AT TIME ZONE 'UTC'`;
  return qlikDateFromAny(sql);
}

export function qlikTimestampFromTyped(
  expression: ExprQlik,
  sql: string,
  environment: EntornoExpresionQlik,
): string {
  const type = tipoIdentificador(expression, environment);
  if (type === "TIMESTAMP") return sql;
  if (type === "DATETIME") return `TIMESTAMP(${sql}, 'UTC')`;
  if (type === "DATE") return `TIMESTAMP(${sql}, 'UTC')`;
  if (type === "TIME")
    return `TIMESTAMP(DATETIME(DATE '1899-12-30', ${sql}), 'UTC')`;
  return qlikTimestampFromAny(sql);
}

export function qlikTimeExtractSource(
  expression: ExprQlik,
  sql: string,
  environment: EntornoExpresionQlik,
): string {
  const type = tipoIdentificador(expression, environment);
  if (type === "TIMESTAMP") return `${sql} AT TIME ZONE 'UTC'`;
  if (type === "DATETIME" || type === "TIME") return sql;
  if (type === "DATE") return `TIMESTAMP(${sql}, 'UTC')`;
  return qlikTimestampFromAny(sql);
}

function tipoIdentificador(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string | undefined {
  return expression.kind === "identifier"
    ? tipoCampoBigQuery(expression.name, environment)
    : undefined;
}

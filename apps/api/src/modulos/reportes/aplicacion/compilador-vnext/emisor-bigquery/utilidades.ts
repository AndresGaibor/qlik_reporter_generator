import type {
  ContextoExpresion,
  EntornoExpresionQlik,
  ExprQlik,
} from "../expresiones-qlik.js";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "../expresiones-qlik.js";
import { ErrorCompilacionVNext } from "../modelo.js";

export function qlikExpr(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  return emitirExpresionBigQuery(expression, "value", environment);
}

export function imprimirExprClave(expression: ExprQlik): string {
  return JSON.stringify(expression);
}

export function qualifiedValue(
  expression: string,
  environment: EntornoExpresionQlik,
): string {
  const sql = qlikExpr(parsearExpresionQlik(expression), environment);
  return sql.replace(
    /`([^`]+)`/g,
    (_match, identifier: string) => `src.${quote(identifier)}`,
  );
}

export function qlikLiteral(raw: string): string | undefined {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'");
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1).replace(/""/g, '"');
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return value;
  return undefined;
}

export function numberSetting(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function qlik(
  expression: string | ExprQlik,
  context: ContextoExpresion = "value",
  environment: EntornoExpresionQlik = {},
): string {
  return emitirExpresionBigQuery(
    typeof expression === "string"
      ? parsearExpresionQlik(expression)
      : expression,
    context,
    environment,
  );
}

export function quote(identifier: string): string {
  if (!identifier || identifier.includes("`"))
    fail(
      "BIGQUERY_INVALID_IDENTIFIER",
      `Identificador inválido: ${identifier}`,
    );
  return `\`${identifier}\``;
}

export function wrap(sql: string, alias: string, baseIndent = 0): string {
  const prefix = " ".repeat(baseIndent);
  return `(\n${indent(sql, baseIndent + 2)}\n${prefix}) AS ${alias}`;
}

export function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function fail(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category: "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}

import { ErrorCompilacionVNext } from "../modelo.js";
import type { Token } from "./parser.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";

export function quoteIdentifier(name: string): string {
  if (!name || name.includes("`"))
    fail(
      "EXPRESSION_INVALID_IDENTIFIER",
      `Identificador inválido: ${name}`,
      name,
      0,
    );
  return `\`${name}\``;
}

export function qualifiedIdentifier(
  name: string,
  environment: EntornoExpresionQlik,
): string {
  const identifier = quoteIdentifier(name);
  return environment.identifierQualifier
    ? `${environment.identifierQualifier}.${identifier}`
    : identifier;
}

export function literalString(
  expression: ExprQlik,
  functionName: string,
): string {
  if (expression.kind !== "string")
    fail(
      "FUNCTION_LITERAL_FORMAT_REQUIRED",
      `${functionName} requiere que el formato/separador sea literal en esta fase`,
      functionName,
      0,
    );
  return expression.value;
}

export function arity(name: string, args: ExprQlik[], expected: number): void {
  if (args.length !== expected)
    fail(
      "FUNCTION_ARITY",
      `${name} requiere ${expected} argumentos y recibió ${args.length}`,
      name,
      0,
    );
}

export function requiredArgument<T>(
  value: T | undefined,
  functionName = "expresión",
): T {
  if (value === undefined)
    fail(
      "FUNCTION_ARITY",
      `${functionName} requiere un argumento`,
      functionName,
      0,
    );
  return value;
}

export function requiredToken(token: Token | undefined, source: string): Token {
  if (token === undefined)
    fail("EXPRESSION_EXPECTED", "Se esperaba una expresión", source, 0);
  return token;
}

export function arityRange(
  name: string,
  args: ExprQlik[],
  min: number,
  max: number,
): void {
  if (args.length < min || args.length > max)
    fail(
      "FUNCTION_ARITY",
      `${name} requiere entre ${min} y ${max} argumentos y recibió ${args.length}`,
      name,
      0,
    );
}

export function quoteString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function parenthesize(sql: string): string {
  return /^[A-Za-z0-9_`.]+$/.test(sql) ? sql : `(${sql})`;
}

export function fail(
  code: string,
  message: string,
  source: string,
  offset: number,
): never {
  throw new ErrorCompilacionVNext({
    code,
    category:
      code.startsWith("FUNCTION") || code.startsWith("OPERATOR")
        ? "UNSUPPORTED_SEMANTICS"
        : code.startsWith("STATISTICS_")
          ? "BIGQUERY_LOWERING"
          : "SYNTAX",
    message,
    span: {
      start: offset,
      end: Math.min(source.length, offset + 1),
      line: 1,
      column: offset + 1,
      endLine: 1,
      endColumn: offset + 2,
    },
    snippet: source.slice(Math.max(0, offset - 40), offset + 120),
  });
}

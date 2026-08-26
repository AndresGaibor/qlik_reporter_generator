import type { EntornoExpresionQlik, ExprQlik } from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

export interface BindingMapSubstringQlik {
  callKey: string;
  alias: string;
  keyField: string;
  valueField: string;
  sourceSql: string;
}

export function emitirMapSubstring(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
  emitValue: (
    expression: ExprQlik,
    environment: EntornoExpresionQlik,
  ) => string,
): string {
  if (expression.args.length !== 2)
    fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere dos argumentos: nombre de mapping y expresión`,
    );
  const binding = environment.mapSubstringBindings?.get(
    JSON.stringify(expression),
  );
  if (!binding)
    fail(
      "MAPSUBSTRING_REQUIRES_PROVEN_MAPPING",
      "MapSubstring requiere una tabla MAPPING con orden y claves compile-time demostrables",
    );
  const sourceExpression = expression.args[1];
  if (!sourceExpression)
    fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere una expresión de entrada`,
    );
  const source = `CAST(${emitValue(sourceExpression, environment)} AS STRING)`;
  const cte = `__qlik_map_substring_${binding.alias}`;
  const state = `${cte}_state`;
  const key = `${cte}_key`;
  const value = `${cte}_value`;
  const order = `${cte}_order`;
  const sourceSql = `(
${indent(binding.sourceSql, 2)}
) AS ${cte}_source`;
  const match = `FROM ${cte}
        WHERE SUBSTR(${source}, state.__qlik_map_substring_pos, LENGTH(${key})) = ${key}
        ORDER BY LENGTH(${key}) DESC, ${order}
        LIMIT 1`;
  return `CASE WHEN ${source} IS NULL THEN NULL ELSE (
  WITH RECURSIVE
  ${cte} AS (
    SELECT
      CAST(${cte}_source.${quote(binding.keyField)} AS STRING) AS ${key},
      CAST(${cte}_source.${quote(binding.valueField)} AS STRING) AS ${value},
      ROW_NUMBER() OVER () AS ${order}
    FROM ${sourceSql}
  ),
  ${state} AS (
    SELECT
      1 AS __qlik_map_substring_pos,
      '' AS __qlik_map_substring_result
    UNION ALL
    SELECT
      state.__qlik_map_substring_pos + COALESCE((SELECT LENGTH(${key}) ${match}), 1),
      CONCAT(
        state.__qlik_map_substring_result,
        COALESCE((SELECT ${value} ${match}), SUBSTR(${source}, state.__qlik_map_substring_pos, 1))
      )
    FROM ${state} AS state
    WHERE state.__qlik_map_substring_pos <= LENGTH(${source})
  )
  SELECT __qlik_map_substring_result
  FROM ${state}
  WHERE __qlik_map_substring_pos > LENGTH(${source})
  ORDER BY __qlik_map_substring_pos DESC
  LIMIT 1
) END`;
}

function quote(identifier: string): string {
  if (!identifier || identifier.includes("`"))
    fail(
      "BIGQUERY_INVALID_IDENTIFIER",
      `Identificador inválido: ${identifier}`,
    );
  return `\`${identifier}\``;
}

function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function fail(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category:
      code === "MAPSUBSTRING_REQUIRES_PROVEN_MAPPING"
        ? "UNSUPPORTED_SEMANTICS"
        : "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}

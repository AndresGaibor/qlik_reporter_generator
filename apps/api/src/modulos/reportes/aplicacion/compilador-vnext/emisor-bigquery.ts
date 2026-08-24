import {
  emitirExpresionBigQuery,
  type EntornoExpresionQlik,
  parsearExpresionQlik,
  type ContextoExpresion,
} from "./expresiones-qlik.js";
import type { PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import type { CampoLoadVNext } from "./parser-carga.js";

export interface EmisionBigQueryVNext {
  sql: string;
  strategy: "source_sql_passthrough" | "single_query";
}

export function emitirBigQueryVNext(
  plan: PlanCompilacionVNext,
): EmisionBigQueryVNext {
  const environment = extraerEntornoExpresion(plan);
  const byId = new Map(
    plan.relations.map((relation) => [relation.id, relation]),
  );
  const output = plan.outputRelationId
    ? byId.get(plan.outputRelationId)
    : undefined;
  if (!output)
    fail(
      "BIGQUERY_NO_OUTPUT_RELATION",
      "El programa no produjo una relación de salida exportable",
    );

  const cache = new Map<string, string>();
  const emit = (id: string): string => {
    const cached = cache.get(id);
    if (cached) return cached;
    const relation = byId.get(id);
    if (!relation)
      fail("BIGQUERY_RELATION_NOT_FOUND", `No existe la relación ${id}`);
    const sql = emitirRelacion(relation, byId, emit, environment);
    cache.set(id, sql);
    return sql;
  };

  return {
    sql: emit(output.id).trim().replace(/;\s*$/, ""),
    strategy:
      output.op === "native_sql" ? "source_sql_passthrough" : "single_query",
  };
}

function emitirRelacion(
  relation: RelacionVNext,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
  environment: EntornoExpresionQlik,
): string {
  switch (relation.op) {
    case "native_sql":
      return relation.sql.trim().replace(/;\s*$/, "");
    case "filter":
      return `SELECT *\nFROM ${wrap(emit(relation.input), "src")}\nWHERE ${qlik(relation.condition, "condition", environment)}`;
    case "project": {
      const input = byId.get(relation.input);
      const absorbed = input?.op === "filter" ? input : undefined;
      const sourceId = absorbed?.input ?? relation.input;
      const where = absorbed
        ? `\nWHERE ${qlik(absorbed.condition, "condition", environment)}`
        : "";
      const from = emitirFuenteParaProyeccion(sourceId, relation.projections, byId, emit);
      return `SELECT\n  ${emitFields(relation.projections, environment)}\nFROM ${from}${where}`;
    }
    case "aggregate": {
      const input = byId.get(relation.input);
      const absorbed = input?.op === "filter" ? input : undefined;
      const sourceId = absorbed?.input ?? relation.input;
      const where = absorbed
        ? `\nWHERE ${qlik(absorbed.condition, "condition", environment)}`
        : "";
      const group = relation.groupBy
        .map((expression) => qlik(expression, "value", environment))
        .join(", ");
      const from = emitirFuenteParaProyeccion(sourceId, relation.projections, byId, emit);
      return `SELECT\n  ${emitFields(relation.projections, environment)}\nFROM ${from}${where}\nGROUP BY ${group}`;
    }
    case "sort":
      return `SELECT *\nFROM ${wrap(emit(relation.input), "src")}\nORDER BY ${relation.orderBy
        .map(
          (item) => `${qlik(item.expression, "value", environment)} ${item.direction.toUpperCase()}`,
        )
        .join(", ")}`;
    case "limit": {
      const limit = relation.limitExpression.trim();
      if (!/^\d+$/.test(limit)) {
        fail(
          "BIGQUERY_DYNAMIC_FIRST_UNSUPPORTED",
          `FIRST requiere un entero compile-time en esta fase: ${limit}`,
        );
      }
      return `SELECT *\nFROM ${wrap(emit(relation.input), "src")}\nLIMIT ${limit}`;
    }
    case "join":
      return emitirJoin(relation, byId, emit);
    case "union_all":
      return emitirUnion(relation, byId, emit);
    case "semi_filter":
      return emitirSemiFilter(relation, emit);
    case "unpivot":
      return `SELECT *\nFROM ${wrap(emit(relation.input), "src")}\nUNPIVOT${
        relation.includeNulls ? " INCLUDE NULLS" : ""
      } (${quote(relation.dataField)} FOR ${quote(relation.attributeField)} IN (${relation.valueFields
        .map(quote)
        .join(", ")}))`;
    case "generic":
      fail(
        "BIGQUERY_GENERIC_MULTI_RELATION",
        "Generic LOAD crea una tabla lógica por atributo y no puede exportarse como una sola relación sin una selección explícita",
      );
  }
}

function emitirFuenteParaProyeccion(
  sourceId: string,
  projections: CampoLoadVNext[],
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
): string {
  const source = byId.get(sourceId);
  if (
    source?.op === "native_sql" &&
    projections.every((field) => field.expression !== "*")
  ) {
    const direct = extraerFromNativoSimple(source.sql);
    if (direct) return direct;
  }
  return wrap(emit(sourceId), "src");
}

function extraerFromNativoSimple(sql: string): string | undefined {
  const normalized = sql.trim().replace(/;\s*$/, "");
  if (/\/\*|--/.test(normalized) || /^\s*SELECT\s+DISTINCT\b/i.test(normalized))
    return undefined;
  const match = normalized.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)\s*$/i);
  if (!match?.[1] || !match[2]) return undefined;

  const identifier = String.raw`(?:\`[^\`]+\`|[A-Za-z_][A-Za-z0-9_$]*)(?:\.(?:\`[^\`]+\`|[A-Za-z_][A-Za-z0-9_$]*))*`;
  const fieldPattern = new RegExp(`^${identifier}$`);
  const fields = match[1].split(",").map((field) => field.trim());
  if (fields.length === 0 || fields.some((field) => !fieldPattern.test(field)))
    return undefined;

  const tablePattern = new RegExp(
    `^${identifier}(?:\\s+(?:AS\\s+)?[A-Za-z_][A-Za-z0-9_$]*)?$`,
    "i",
  );
  const from = match[2].trim();
  return tablePattern.test(from) ? from : undefined;
}

function emitirJoin(
  relation: Extract<RelacionVNext, { op: "join" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
): string {
  const left = byId.get(relation.left);
  const right = byId.get(relation.right);
  if (!left || !right)
    fail(
      "BIGQUERY_JOIN_INPUT_MISSING",
      "JOIN referencia una relación inexistente",
    );
  const fields: string[] = [];
  for (const field of left.fields) {
    if (
      relation.keys.includes(field) &&
      (relation.join === "right" || relation.join === "full")
    ) {
      fields.push(
        `COALESCE(l.${quote(field)}, r.${quote(field)}) AS ${quote(field)}`,
      );
    } else {
      fields.push(`l.${quote(field)} AS ${quote(field)}`);
    }
  }
  for (const field of right.fields) {
    if (!left.fields.includes(field))
      fields.push(`r.${quote(field)} AS ${quote(field)}`);
  }
  const on = relation.keys
    .map((key) => `l.${quote(key)} = r.${quote(key)}`)
    .join(" AND ");
  return `SELECT\n  ${fields.join(",\n  ")}\nFROM ${wrap(emit(left.id), "l")}\n${relation.join.toUpperCase()} JOIN ${wrap(
    emit(right.id),
    "r",
  )}\n  ON ${on}`;
}

function emitirUnion(
  relation: Extract<RelacionVNext, { op: "union_all" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
): string {
  return relation.inputs
    .map((id, index) => {
      const input = byId.get(id);
      if (!input)
        fail("BIGQUERY_UNION_INPUT_MISSING", `UNION referencia ${id}`);
      const alias = `u${index + 1}`;
      const fields = relation.fields
        .map((field) =>
          input.fields.includes(field)
            ? `${alias}.${quote(field)} AS ${quote(field)}`
            : `NULL AS ${quote(field)}`,
        )
        .join(",\n  ");
      return `SELECT\n  ${fields}\nFROM ${wrap(emit(id), alias)}`;
    })
    .join("\nUNION ALL\n");
}

function emitirSemiFilter(
  relation: Extract<RelacionVNext, { op: "semi_filter" }>,
  emit: (id: string) => string,
): string {
  const on = relation.keys
    .map((key) => `i.${quote(key)} = k.${quote(key)}`)
    .join(" AND ");
  return `SELECT i.*\nFROM ${wrap(emit(relation.input), "i")}\nWHERE EXISTS (\n  SELECT 1\n  FROM ${wrap(
    emit(relation.against),
    "k",
    2,
  )}\n  WHERE ${on}\n)`;
}

function emitFields(
  fields: CampoLoadVNext[],
  environment: EntornoExpresionQlik,
): string {
  return fields
    .map((field) => {
      if (field.expression === "*") return "*";
      const expression = qlik(field.expression, "value", environment);
      if (sameIdentifier(field.expression, field.alias)) return expression;
      return `${expression} AS ${quote(field.alias)}`;
    })
    .join(",\n  ");
}

function sameIdentifier(expression: string, alias: string): boolean {
  const normalized = expression
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^`|`$/g, "")
    .split(".")
    .at(-1);
  return normalized === alias;
}

function extraerEntornoExpresion(
  plan: PlanCompilacionVNext,
): EntornoExpresionQlik {
  const environment: EntornoExpresionQlik = {};
  for (const effect of plan.effects) {
    if (effect.kind !== "define_variable") continue;
    const match = effect.body.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/s);
    if (!match?.[1] || match[2] === undefined) continue;
    const value = qlikLiteral(match[2]);
    if (value === undefined) continue;
    switch (match[1].toLowerCase()) {
      case "dateformat":
        environment.dateFormat = value;
        break;
      case "timeformat":
        environment.timeFormat = value;
        break;
      case "timestampformat":
        environment.timestampFormat = value;
        break;
      case "monthnames":
        environment.monthNames = value.split(";");
        break;
      case "daynames":
        environment.dayNames = value.split(";");
        break;
      case "decimalsep":
        environment.decimalSep = value;
        break;
      case "thousandsep":
        environment.thousandSep = value;
        break;
      case "firstweekday":
        environment.firstWeekDay = numberSetting(value);
        break;
      case "brokenweeks":
        environment.brokenWeeks = numberSetting(value);
        break;
      case "referenceday":
        environment.referenceDay = numberSetting(value);
        break;
      case "firstmonthofyear":
        environment.firstMonthOfYear = numberSetting(value);
        break;
    }
  }
  return environment;
}

function qlikLiteral(raw: string): string | undefined {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'");
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1).replace(/""/g, '"');
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return value;
  return undefined;
}

function numberSetting(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function qlik(
  expression: string,
  context: ContextoExpresion = "value",
  environment: EntornoExpresionQlik = {},
): string {
  return emitirExpresionBigQuery(
    parsearExpresionQlik(expression),
    context,
    environment,
  );
}

function quote(identifier: string): string {
  if (!identifier || identifier.includes("`"))
    fail(
      "BIGQUERY_INVALID_IDENTIFIER",
      `Identificador inválido: ${identifier}`,
    );
  return `\`${identifier}\``;
}

function wrap(sql: string, alias: string, baseIndent = 0): string {
  const prefix = " ".repeat(baseIndent);
  return `(\n${indent(sql, baseIndent + 2)}\n${prefix}) AS ${alias}`;
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
    category: "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}

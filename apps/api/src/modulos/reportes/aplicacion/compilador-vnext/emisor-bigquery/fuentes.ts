import type {
  BindingApplyMapQlik,
  EntornoExpresionQlik,
} from "../expresiones-qlik.js";
import type {
  LookupApplyMapVNext,
  LookupMapSubstringVNext,
  RelacionVNext,
} from "../ir.js";
import type { CampoLoadVNext } from "../parser-carga.js";
import { entornoFuente } from "./entornos.js";
import { emitFields } from "./relacional.js";
import { fail, qlik, quote, wrap } from "./utilidades.js";

export function emitirInline(
  relation: Extract<RelacionVNext, { op: "inline" }>,
): string {
  if (relation.rows.length === 0)
    return `SELECT\n  ${relation.columns.map((column) => `NULL AS ${quote(column)}`).join(",\n  ")}\nWHERE FALSE`;
  return relation.rows
    .map(
      (row) =>
        `SELECT\n  ${relation.columns
          .map(
            (column, index) =>
              `${emitirValorInline(row[index] ?? "")} AS ${quote(column)}`,
          )
          .join(",\n  ")}`,
    )
    .join("\nUNION ALL\n");
}

export function emitirAutogenerate(
  relation: Extract<RelacionVNext, { op: "autogenerate" }>,
  environment: EntornoExpresionQlik,
): string {
  const fields = emitFields(relation.projections, environment, {}, false);
  if (relation.countExpression === "0")
    return `SELECT\n  ${fields}\nWHERE FALSE`;
  if (relation.countExpression === "1") return `SELECT\n  ${fields}`;
  return `SELECT\n  ${fields}\nFROM UNNEST(GENERATE_ARRAY(1, ${relation.countExpression})) AS _row`;
}

export function emitirValorInline(raw: string): string {
  const value = raw.trim();
  if (!value || /^null\(\)$/i.test(value) || /^null$/i.test(value))
    return "NULL";
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
    return value;
  if (/^(?:true|false)$/i.test(value)) return value.toUpperCase();
  if (value.startsWith("'") && value.endsWith("'")) return value;
  if (value.startsWith('"') && value.endsWith('"'))
    return `'${value.slice(1, -1).replace(/""/g, '"').replace(/'/g, "''")}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

export function emitirFuenteParaProyeccion(
  sourceId: string,
  relation: {
    projections: CampoLoadVNext[];
    mappingLookups?: LookupApplyMapVNext[];
    mapSubstringLookups?: LookupMapSubstringVNext[];
  },
  byId: Map<string, RelacionVNext>,
  emit: (id: string, includeInternal?: boolean) => string,
  environment: EntornoExpresionQlik,
): string {
  const source = byId.get(sourceId);
  const lookups = relation.mappingLookups ?? [];
  if (
    source?.op === "native_sql" &&
    relation.projections.every((field) => field.expression !== "*") &&
    lookups.length === 0
  ) {
    const direct = extraerFromNativoSimple(source.sql);
    if (direct) return direct;
  }
  const directSource =
    source?.op === "native_sql"
      ? extraerFromNativoSimple(source.sql)
      : undefined;
  let from = directSource
    ? `${directSource} AS src`
    : wrap(emit(sourceId, true), "src");
  const bindings = new Map(
    lookups.map((lookup) => [lookup.callKey, toBinding(lookup)]),
  );
  for (const lookup of lookups) {
    if (!byId.has(lookup.relationId))
      fail(
        "BIGQUERY_MAPPING_RELATION_MISSING",
        `No existe la relación del mapping ${lookup.mappingName}`,
      );
    const mappingSql = wrap(
      emit(lookup.relationId, true),
      `${lookup.alias}_source`,
      2,
    );
    const mapping = `(
  SELECT
    ${lookup.alias}_source.${quote(lookup.keyField)} AS ${quote(
      lookup.keyField,
    )},
    ${lookup.alias}_source.${quote(lookup.lookupNumericField)} AS ${quote(
      lookup.lookupNumericField,
    )},
    ${lookup.alias}_source.${quote(lookup.lookupTextField)} AS ${quote(
      lookup.lookupTextField,
    )},
    TRUE AS ${quote(lookup.hitField)}
  FROM ${mappingSql}
) AS ${lookup.alias}`;
    const key = qlik(
      lookup.keyExpression,
      "value",
      entornoFuente(environment, bindings),
    );
    from += `\nLEFT JOIN ${mapping}\n  ON ${key} = ${lookup.alias}.${quote(
      lookup.keyField,
    )}`;
  }
  return from;
}

export function toBinding(lookup: LookupApplyMapVNext): BindingApplyMapQlik {
  return {
    callKey: lookup.callKey,
    alias: lookup.alias,
    hitField: lookup.hitField,
    lookupValueField: lookup.lookupValueField,
    lookupNumericField: lookup.lookupNumericField,
    lookupTextField: lookup.lookupTextField,
    ...(lookup.defaultExpression
      ? { defaultExpression: lookup.defaultExpression }
      : {}),
    keyExpression: lookup.keyExpression,
  };
}

export function extraerFromNativoSimple(sql: string): string | undefined {
  const normalized = sql.trim().replace(/;\s*$/, "");
  if (/\/\*|--/.test(normalized) || /^\s*SELECT\s+DISTINCT\b/i.test(normalized))
    return undefined;
  const match = normalized.match(
    /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)\s*$/i,
  );
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

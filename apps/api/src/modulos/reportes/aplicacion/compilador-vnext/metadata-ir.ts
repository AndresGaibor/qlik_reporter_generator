import type {
  CatalogoMetadataBigQuery,
  MetadataCampoBigQuery,
} from "../../../google-cloud/dominio/metadata-bigquery.js";
import { parsearExpresionQlik } from "./expresiones-qlik.js";
import type { ExprQlik } from "./expresiones-qlik.js";
import type {
  MetadataCampoIRVNext,
  PlanCompilacionVNext,
  RelacionVNext,
} from "./ir.js";

const NUMERIC_TYPES = new Set(["INT64", "FLOAT64", "NUMERIC", "BIGNUMERIC"]);

export function enriquecerPlanConMetadataBigQuery(
  plan: PlanCompilacionVNext,
  catalogo?: CatalogoMetadataBigQuery,
): PlanCompilacionVNext {
  if (!catalogo || Object.keys(catalogo).length === 0) return plan;
  const relations: RelacionVNext[] = [];
  const byId = new Map<string, RelacionVNext>();
  for (const relation of plan.relations) {
    const enriched = enriquecerRelacion(relation, byId, catalogo);
    relations.push(enriched);
    byId.set(enriched.id, enriched);
  }
  return { ...plan, relations };
}

function enriquecerRelacion(
  relation: RelacionVNext,
  byId: ReadonlyMap<string, RelacionVNext>,
  catalogo: CatalogoMetadataBigQuery,
): RelacionVNext {
  if (relation.op === "native_sql")
    return enriquecerSqlNativo(relation, catalogo);
  if (relation.op === "inline" || relation.op === "autogenerate")
    return relation;
  if (relation.op === "join") return enriquecerJoin(relation, byId);
  if (relation.op === "union_all") return enriquecerUnion(relation, byId);
  if (relation.op === "unpivot") return enriquecerUnpivot(relation, byId);
  const inputId = "input" in relation ? relation.input : undefined;
  const input = inputId ? byId.get(inputId) : undefined;
  if (!input) return relation;
  if (relation.op === "project" || relation.op === "aggregate") {
    const metadata = inferirProyecciones(
      relation.projections,
      input.fieldMetadata,
    );
    return {
      ...relation,
      fieldMetadata: metadata,
      sourceRefs: input.sourceRefs,
    };
  }
  return {
    ...relation,
    fieldMetadata: input.fieldMetadata,
    sourceRefs: input.sourceRefs,
  };
}

function enriquecerSqlNativo(
  relation: Extract<RelacionVNext, { op: "native_sql" }>,
  catalogo: CatalogoMetadataBigQuery,
): RelacionVNext {
  const parsed = parseSimpleSelect(relation.sql);
  if (!parsed) return relation;
  const table = resolverTablaCatalogo(parsed.table, catalogo);
  if (!table) return relation;
  const fieldMetadata: Record<string, MetadataCampoIRVNext> = {};
  const fields: string[] = [];
  for (const item of parsed.items) {
    if (item.star) {
      for (const [name, metadata] of Object.entries(table.fields)) {
        if (!fieldMetadata[name]) fields.push(name);
        fieldMetadata[name] = withProvenance(metadata, table.tableId, name);
      }
      continue;
    }
    if (!item.source || !item.alias) continue;
    const metadata = lookupCaseInsensitive(table.fields, item.source);
    if (!metadata) continue;
    fields.push(item.alias);
    fieldMetadata[item.alias] = withProvenance(
      metadata.value,
      table.tableId,
      metadata.key,
    );
  }
  if (fields.length === 0) return relation;
  return {
    ...relation,
    fields,
    schemaKnown: parsed.complete,
    fieldMetadata,
    sourceRefs: [table.tableId],
  };
}

function enriquecerJoin(
  relation: Extract<RelacionVNext, { op: "join" }>,
  byId: ReadonlyMap<string, RelacionVNext>,
): RelacionVNext {
  const left = byId.get(relation.left);
  const right = byId.get(relation.right);
  if (!left || !right) return relation;
  const result: Record<string, MetadataCampoIRVNext> = {};
  for (const field of relation.fields) {
    const leftMeta = left.fieldMetadata?.[field];
    const rightMeta = right.fieldMetadata?.[field];
    const meta = leftMeta ?? rightMeta;
    if (!meta) continue;
    const nullableByJoin =
      (relation.join === "left" && !leftMeta) ||
      (relation.join === "right" && !rightMeta) ||
      relation.join === "full";
    result[field] = nullableByJoin ? { ...meta, mode: "NULLABLE" } : meta;
  }
  return {
    ...relation,
    fieldMetadata: result,
    sourceRefs: [
      ...new Set([...(left.sourceRefs ?? []), ...(right.sourceRefs ?? [])]),
    ],
  };
}

function enriquecerUnion(
  relation: Extract<RelacionVNext, { op: "union_all" }>,
  byId: ReadonlyMap<string, RelacionVNext>,
): RelacionVNext {
  const inputs = relation.inputs
    .map((id) => byId.get(id))
    .filter(Boolean) as RelacionVNext[];
  const metadata: Record<string, MetadataCampoIRVNext> = {};
  for (const field of relation.fields) {
    const values = inputs
      .map((input) => input.fieldMetadata?.[field])
      .filter(Boolean) as MetadataCampoIRVNext[];
    const merged = mergeMetadata(values);
    if (merged) metadata[field] = merged;
  }
  return {
    ...relation,
    fieldMetadata: metadata,
    sourceRefs: [...new Set(inputs.flatMap((input) => input.sourceRefs ?? []))],
  };
}

function enriquecerUnpivot(
  relation: Extract<RelacionVNext, { op: "unpivot" }>,
  byId: ReadonlyMap<string, RelacionVNext>,
): RelacionVNext {
  const input = byId.get(relation.input);
  if (!input) return relation;
  const metadata: Record<string, MetadataCampoIRVNext> = {};
  for (const field of relation.qualifierFields) {
    const current = input.fieldMetadata?.[field];
    if (current) metadata[field] = current;
  }
  metadata[relation.attributeField] = { type: "STRING", mode: "REQUIRED" };
  const values = relation.valueFields
    .map((field) => input.fieldMetadata?.[field])
    .filter(Boolean) as MetadataCampoIRVNext[];
  const merged = mergeMetadata(values);
  if (merged) metadata[relation.dataField] = { ...merged, mode: "NULLABLE" };
  return { ...relation, fieldMetadata: metadata, sourceRefs: input.sourceRefs };
}

function inferirProyecciones(
  projections: readonly { expression: string; alias: string }[],
  input?: Readonly<Record<string, MetadataCampoIRVNext>>,
): Readonly<Record<string, MetadataCampoIRVNext>> {
  const result: Record<string, MetadataCampoIRVNext> = {};
  for (const projection of projections) {
    const inferred = inferirExpresion(projection.expression, input);
    if (inferred) result[projection.alias] = inferred;
  }
  return result;
}

function inferirExpresion(
  expression: string,
  input?: Readonly<Record<string, MetadataCampoIRVNext>>,
): MetadataCampoIRVNext | undefined {
  let ast: ExprQlik;
  try {
    ast = parsearExpresionQlik(expression);
  } catch {
    return undefined;
  }
  const infer = (node: ExprQlik): MetadataCampoIRVNext | undefined => {
    if (node.kind === "identifier")
      return lookupCaseInsensitive(input ?? {}, node.name)?.value;
    if (node.kind === "number")
      return {
        type: /^[-+]?\d+$/.test(node.raw) ? "INT64" : "NUMERIC",
        mode: "REQUIRED",
      };
    if (node.kind === "string") return { type: "STRING", mode: "REQUIRED" };
    if (node.kind === "unary") return infer(node.operand);
    if (node.kind === "binary") {
      if (!["+", "-", "*", "/"].includes(node.operator))
        return { type: "BOOL", mode: "NULLABLE" };
      return mergeNumeric(
        infer(node.left),
        infer(node.right),
        node.operator === "/",
      );
    }
    if (node.kind !== "call") return undefined;
    const name = node.name.toLowerCase();
    if (
      [
        "year",
        "month",
        "day",
        "week",
        "weekyear",
        "quarter",
        "hour",
        "minute",
        "second",
        "len",
        "count",
        "numericcount",
        "textcount",
      ].includes(name)
    )
      return { type: "INT64", mode: "NULLABLE" };
    if (
      [
        "upper",
        "lower",
        "trim",
        "ltrim",
        "rtrim",
        "left",
        "right",
        "mid",
        "replace",
        "keepchar",
        "purgechar",
      ].includes(name)
    )
      return { type: "STRING", mode: "NULLABLE" };
    if (["sum", "min", "max"].includes(name))
      return node.args[0] ? infer(node.args[0]) : undefined;
    if (name === "avg") {
      const arg = node.args[0] ? infer(node.args[0]) : undefined;
      if (!arg || !NUMERIC_TYPES.has(arg.type)) return undefined;
      return {
        ...arg,
        type: arg.type === "INT64" ? "FLOAT64" : arg.type,
        mode: "NULLABLE",
      };
    }
    if (["date", "makedate"].includes(name))
      return { type: "DATE", mode: "NULLABLE" };
    if (["timestamp", "timestamp#"].includes(name))
      return { type: "TIMESTAMP", mode: "NULLABLE" };
    return undefined;
  };
  return infer(ast);
}

function mergeNumeric(
  left?: MetadataCampoIRVNext,
  right?: MetadataCampoIRVNext,
  division = false,
): MetadataCampoIRVNext | undefined {
  if (
    !left ||
    !right ||
    !NUMERIC_TYPES.has(left.type) ||
    !NUMERIC_TYPES.has(right.type)
  )
    return undefined;
  const types = new Set([left.type, right.type]);
  const type =
    division || types.has("FLOAT64")
      ? "FLOAT64"
      : types.has("BIGNUMERIC")
        ? "BIGNUMERIC"
        : types.has("NUMERIC")
          ? "NUMERIC"
          : "INT64";
  return {
    type,
    mode:
      left.mode === "REQUIRED" && right.mode === "REQUIRED"
        ? "REQUIRED"
        : "NULLABLE",
  };
}

function mergeMetadata(
  values: readonly MetadataCampoIRVNext[],
): MetadataCampoIRVNext | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  if (
    !first ||
    values.some(
      (value) => value.type !== first.type || value.mode === "REPEATED",
    )
  )
    return undefined;
  return {
    ...first,
    mode: values.every((value) => value.mode === "REQUIRED")
      ? "REQUIRED"
      : "NULLABLE",
  };
}

function withProvenance(
  metadata: MetadataCampoBigQuery,
  sourceTable: string,
  sourceField: string,
): MetadataCampoIRVNext {
  return { ...metadata, sourceTable, sourceField };
}

function resolverTablaCatalogo(
  tableRef: string,
  catalogo: CatalogoMetadataBigQuery,
) {
  const exact = catalogo[tableRef];
  if (exact) return exact;
  const normalized = stripTicks(tableRef).toLowerCase();
  return Object.values(catalogo).find((item) => {
    const candidates = [
      item.tableId,
      ...Object.keys(catalogo).filter((key) => catalogo[key] === item),
    ];
    return candidates.some((candidate) => {
      const value = stripTicks(candidate).toLowerCase();
      return value === normalized || value.endsWith(`.${normalized}`);
    });
  });
}

function lookupCaseInsensitive<T>(
  record: Readonly<Record<string, T>>,
  name: string,
): { key: string; value: T } | undefined {
  if (record[name] !== undefined)
    return { key: name, value: record[name] as T };
  const key = Object.keys(record).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? { key, value: record[key] as T } : undefined;
}

interface SimpleSelectItem {
  star?: boolean;
  source?: string;
  alias?: string;
}
interface SimpleSelect {
  table: string;
  items: SimpleSelectItem[];
  complete: boolean;
}

function parseSimpleSelect(sql: string): SimpleSelect | undefined {
  const cleaned = sql.trim().replace(/;\s*$/, "");
  if (
    /\b(?:WITH|UNION|JOIN|PIVOT|UNPIVOT)\b/i.test(cleaned) ||
    /FROM\s*\(/i.test(cleaned)
  )
    return undefined;
  const match = cleaned.match(
    /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+(`[^`]+`|[A-Za-z0-9_.-]+)(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?(?:\s+(?:WHERE|GROUP\s+BY|ORDER\s+BY|QUALIFY|HAVING|LIMIT)\b|\s*$)/i,
  );
  if (!match?.[1] || !match[2]) return undefined;
  const items = splitTopLevel(match[1]).map(parseSelectItem);
  return {
    table: stripTicks(match[2]),
    items,
    complete: items.every((item) =>
      Boolean(item.star || (item.source && item.alias)),
    ),
  };
}

function parseSelectItem(raw: string): SimpleSelectItem {
  const text = raw.trim();
  if (text === "*" || /^[A-Za-z_][A-Za-z0-9_]*\.\*$/.test(text))
    return { star: true };
  const match = text.match(
    /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))(?:\s+(?:AS\s+)?(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*)))?$/i,
  );
  const source = match?.[1] ?? match?.[2];
  const alias = match?.[3] ?? match?.[4] ?? source;
  return source && alias ? { source: source.trim(), alias: alias.trim() } : {};
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] as string;
    if (quote) {
      current += char;
      if (char === quote && value[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (["'", '"', "`"].includes(char)) {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripTicks(value: string): string {
  return value.trim().replace(/^`|`$/g, "");
}

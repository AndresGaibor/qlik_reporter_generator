import {
  type BindingApplyMapQlik,
  type ContextoExpresion,
  type EntornoExpresionQlik,
  type ExprQlik,
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import type { StatefulLoadVNext } from "./inter-record.js";
import type {
  LookupApplyMapVNext,
  PlanCompilacionVNext,
  RelacionVNext,
} from "./ir.js";
import { nombreCampoDual } from "./mapping-applymap.js";
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
  const emit = (id: string, includeInternal = false): string => {
    const cacheKey = `${id}:${includeInternal ? "internal" : "visible"}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const relation = byId.get(id);
    if (!relation)
      fail("BIGQUERY_RELATION_NOT_FOUND", `No existe la relación ${id}`);
    const sql = emitirRelacion(
      relation,
      byId,
      emit,
      environment,
      includeInternal,
    );
    cache.set(cacheKey, sql);
    return sql;
  };

  return {
    sql: emit(output.id, false).trim().replace(/;\s*$/, ""),
    strategy:
      output.op === "native_sql" ? "source_sql_passthrough" : "single_query",
  };
}

function emitirRelacion(
  relation: RelacionVNext,
  byId: Map<string, RelacionVNext>,
  emit: (id: string, includeInternal?: boolean) => string,
  environment: EntornoExpresionQlik,
  includeInternal: boolean,
): string {
  switch (relation.op) {
    case "inline":
      return emitirInline(relation);
    case "autogenerate":
      return emitirAutogenerate(relation, environment);
    case "native_sql":
      return relation.sql.trim().replace(/;\s*$/, "");
    case "filter":
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nWHERE ${qlik(relation.condition, "condition", environment)}`;
    case "project": {
      const input = byId.get(relation.input);
      const absorbed = input?.op === "filter" ? input : undefined;
      const sourceId = absorbed?.input ?? relation.input;
      const projectEnvironment = entornoProyeccion(
        relation,
        input,
        environment,
      );
      const where = absorbed
        ? `\nWHERE ${qlik(absorbed.condition, "condition", projectEnvironment)}`
        : "";
      const from = emitirFuenteParaProyeccion(
        sourceId,
        relation,
        byId,
        emit,
        environment,
      );
      return `SELECT${relation.distinct ? " DISTINCT" : ""}\n  ${emitFields(
        relation.projections,
        projectEnvironment,
        relation,
        includeInternal,
      )}\nFROM ${from}${where}`;
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
      const from = emitirFuenteParaProyeccion(
        sourceId,
        relation,
        byId,
        emit,
        environment,
      );
      return `SELECT\n  ${emitFields(
        relation.projections,
        environment,
        relation,
        includeInternal,
      )}\nFROM ${from}${where}\nGROUP BY ${group}`;
    }
    case "sort":
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nORDER BY ${relation.orderBy
        .map(
          (item) =>
            `${qlik(item.expression, "value", environment)} ${item.direction.toUpperCase()}`,
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
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nLIMIT ${limit}`;
    }
    case "join":
      return emitirJoin(relation, byId, emit);
    case "union_all":
      return emitirUnion(relation, byId, emit);
    case "semi_filter":
      return emitirSemiFilter(relation, emit);
    case "unpivot":
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nUNPIVOT${
        relation.includeNulls ? " INCLUDE NULLS" : ""
      } (${quote(relation.dataField)} FOR ${quote(relation.attributeField)} IN (${relation.valueFields
        .map(quote)
        .join(", ")}))`;
    case "generic":
      return fail(
        "BIGQUERY_GENERIC_MULTI_RELATION",
        "Generic LOAD crea una tabla lógica por atributo y no puede exportarse como una sola relación sin una selección explícita",
      );
    case "stateful":
      return emitirRelacionInterRegistro(relation, byId, emit, environment);
  }
}

function emitirRelacionInterRegistro(
  relation: Extract<RelacionVNext, { op: "stateful" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
  environment: EntornoExpresionQlik,
): string {
  const stateful = relation.stateful;
  const source = wrap(emit(relation.input), "src");
  const order = stateful.orderBy
    .map(
      (item) =>
        `${qlik(item.expression, "value", environment)} ${item.direction.toUpperCase()}`,
    )
    .join(", ");
  const windowOperations = new Set([
    "row_no",
    "rec_no",
    "iter_no",
    "peek",
    "previous",
    "autonumber",
  ]);
  const hasWindows = stateful.operations.some((operation) =>
    windowOperations.has(operation.kind),
  );
  if (!hasWindows && stateful.iterationCount === 1)
    return emitirExistsOnly(source, stateful, byId, emit, environment);
  if (!order)
    fail(
      "INTER_RECORD_ORDER_REQUIRED",
      "Las funciones inter-record no pueden emitirse sin ORDER BY",
    );

  const previousIndexes = new Map<string, number>();
  for (const operation of stateful.operations.filter(
    (candidate) => candidate.kind === "previous",
  )) {
    const argument = operation.call.args[0];
    if (!argument) continue;
    const key = imprimirExprClave(argument);
    if (!previousIndexes.has(key))
      previousIndexes.set(key, previousIndexes.size + 1);
  }
  const previousColumns = [...previousIndexes.entries()]
    .map(([key, index]) => {
      const operation = stateful.operations.find(
        (candidate) =>
          candidate.kind === "previous" &&
          candidate.call.args[0] &&
          imprimirExprClave(candidate.call.args[0]) === key,
      );
      if (!operation?.call.args[0]) return "";
      return `LAG(${qlikExpr(operation.call.args[0], environment)}, 1) OVER (ORDER BY ${order}) AS __qlik_previous_${index}`;
    })
    .filter(Boolean)
    .join(",\n    ");

  const input = `qlik_input AS (\n  SELECT\n    src.*,\n    ROW_NUMBER() OVER (ORDER BY ${order}) AS __qlik_rec_no\n  FROM ${source}\n)`;
  const previous = previousColumns
    ? `qlik_previous AS (\n  SELECT\n    qlik_input.*,\n    ${previousColumns}\n  FROM qlik_input\n)`
    : "";
  const previousInput = previous ? "qlik_previous" : "qlik_input";
  const where = emitirStatefulWhere(stateful, byId, emit, environment);
  const filtered = where
    ? `qlik_filtered AS (\n  SELECT *\n  FROM ${previousInput} AS src${where}\n)`
    : "";
  const rowInput = filtered ? "qlik_filtered" : previousInput;
  const expanded =
    stateful.iterationCount > 1
      ? `qlik_expanded AS (\n  SELECT\n    ${rowInput}.*,\n    __qlik_iter_no\n  FROM ${rowInput}\n  CROSS JOIN UNNEST(GENERATE_ARRAY(1, ${stateful.iterationCount})) AS __qlik_iter_no\n)`
      : `qlik_expanded AS (\n  SELECT\n    ${rowInput}.*,\n    1 AS __qlik_iter_no\n  FROM ${rowInput}\n)`;

  const autoNumbers = stateful.operations.filter(
    (operation) => operation.kind === "autonumber",
  );
  const autoIndexes = new Map<string, number>();
  for (const operation of autoNumbers) {
    const argument = operation.call.args[0];
    if (!argument) continue;
    const key = imprimirExprClave(argument);
    if (!autoIndexes.has(key)) autoIndexes.set(key, autoIndexes.size + 1);
  }
  const autoKeyExpressions = [...autoIndexes.entries()]
    .map(([key, index]) => {
      const operation = autoNumbers.find(
        (candidate) =>
          candidate.call.args[0] &&
          imprimirExprClave(candidate.call.args[0]) === key,
      );
      if (!operation?.call.args[0]) return "";
      return `${qlikExpr(operation.call.args[0], environment)} AS __qlik_auto_key_${index}`;
    })
    .filter(Boolean);
  const keyCte =
    autoKeyExpressions.length > 0
      ? `qlik_keys AS (\n  SELECT\n    qlik_expanded.*,\n    ${autoKeyExpressions.join(",\n    ")}\n  FROM qlik_expanded\n)`
      : "";
  const rowSource =
    autoKeyExpressions.length > 0 ? "qlik_keys" : "qlik_expanded";
  const autoCtes = [...autoIndexes.values()]
    .map(
      (index) =>
        `qlik_first_keys_${index} AS (\n  SELECT\n    __qlik_auto_key_${index},\n    MIN(__qlik_rec_no) AS __qlik_first_rec\n  FROM qlik_keys\n  WHERE __qlik_auto_key_${index} IS NOT NULL\n  GROUP BY __qlik_auto_key_${index}\n),\nqlik_numbered_keys_${index} AS (\n  SELECT\n    __qlik_auto_key_${index},\n    ROW_NUMBER() OVER (ORDER BY __qlik_first_rec) AS __qlik_auto_no_${index}\n  FROM qlik_first_keys_${index}\n)`,
    )
    .join(",\n");
  const selectFields = stateful.projections
    .map((field) =>
      emitirCampoInterRegistro(
        field.expression,
        field.alias,
        autoIndexes,
        previousIndexes,
        environment,
      ),
    )
    .join(",\n  ");
  const joins = [...autoIndexes.values()]
    .map(
      (index) =>
        `LEFT JOIN qlik_numbered_keys_${index} AS auto_${index}\n  ON auto_${index}.__qlik_auto_key_${index} = src.__qlik_auto_key_${index}`,
    )
    .join("\n");
  const ctes = [
    input,
    ...(previous ? [previous] : []),
    ...(filtered ? [filtered] : []),
    expanded,
    ...(autoKeyExpressions.length > 0 ? [keyCte, autoCtes] : []),
  ].join(",\n");
  return `WITH\n${indent(ctes, 2)}\nSELECT${stateful.distinct ? " DISTINCT" : ""}\n  ${selectFields}\nFROM ${rowSource} AS src${joins ? `\n${joins}` : ""}\nORDER BY src.__qlik_rec_no, src.__qlik_iter_no`;
}

function emitirExistsOnly(
  source: string,
  stateful: StatefulLoadVNext,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
  environment: EntornoExpresionQlik,
): string {
  const fields = stateful.projections
    .map((field) => {
      const expression = qlik(field.expression, "value", environment);
      return sameIdentifier(field.expression, field.alias)
        ? expression
        : `${expression} AS ${quote(field.alias)}`;
    })
    .join(",\n  ");
  const where = emitirStatefulWhere(stateful, byId, emit, environment);
  if (!where)
    fail(
      "STATEFUL_LOWERING_EMPTY",
      "La carga inter-record no tiene una operación emitible",
    );
  return `SELECT${stateful.distinct ? " DISTINCT" : ""}\n  ${fields}\nFROM ${source}${where}`;
}

function emitirStatefulWhere(
  stateful: StatefulLoadVNext,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
  environment: EntornoExpresionQlik,
): string {
  const predicates: string[] = [];
  if (stateful.where)
    predicates.push(qlik(stateful.where, "condition", environment));
  if (stateful.exists) {
    const against = byId.get(stateful.exists.against);
    if (!against)
      fail(
        "BIGQUERY_RELATION_NOT_FOUND",
        `No existe la relación ${stateful.exists.against}`,
      );
    const value = qualifiedValue(stateful.exists.valueExpression, environment);
    predicates.push(
      `EXISTS (\n  SELECT 1\n  FROM ${wrap(emit(against.id), "prior", 2)}\n  WHERE prior.${quote(stateful.exists.field)} = ${value}\n)`,
    );
  }
  return predicates.length > 0 ? `\nWHERE ${predicates.join(" AND ")}` : "";
}

function emitirCampoInterRegistro(
  expression: string,
  alias: string,
  autoIndexes: Map<string, number>,
  previousIndexes: Map<string, number>,
  environment: EntornoExpresionQlik,
): string {
  const parsed = parsearExpresionQlik(expression);
  const value =
    parsed.kind === "call"
      ? emitirLlamadaInterRegistro(
          parsed,
          autoIndexes,
          previousIndexes,
          environment,
        )
      : qlikExpr(parsed, environment);
  return sameIdentifier(expression, alias)
    ? value
    : `${value} AS ${quote(alias)}`;
}

function emitirLlamadaInterRegistro(
  call: Extract<ExprQlik, { kind: "call" }>,
  autoIndexes: Map<string, number>,
  previousIndexes: Map<string, number>,
  environment: EntornoExpresionQlik,
): string {
  const name = call.name.toLowerCase();
  const window = "ORDER BY src.__qlik_rec_no, src.__qlik_iter_no";
  if (["rowno", "recno", "iterno"].includes(name)) {
    if (call.args.length !== 0)
      fail("FUNCTION_ARITY", `${call.name} no admite argumentos en LOAD`);
    if (name === "rowno") return `ROW_NUMBER() OVER (${window})`;
    if (name === "recno") return "src.__qlik_rec_no";
    return "src.__qlik_iter_no";
  }
  if (name === "previous") {
    if (call.args.length !== 1)
      fail("FUNCTION_ARITY", "Previous requiere un argumento");
    const argument = call.args[0];
    if (!argument) fail("FUNCTION_ARITY", "Previous requiere un argumento");
    const index = previousIndexes.get(imprimirExprClave(argument));
    if (!index)
      fail(
        "PREVIOUS_LOWERING_MISSING",
        "No se materializó el estado de Previous",
      );
    return `src.__qlik_previous_${index}`;
  }
  if (name === "peek") {
    if (call.args.length < 1 || call.args.length > 3)
      fail("FUNCTION_ARITY", "Peek requiere entre uno y tres argumentos");
    if (call.args[2])
      fail(
        "PEEK_TABLE_UNSUPPORTED",
        "Peek con una tabla explícita requiere una relación cargada como ámbito",
      );
    const field = call.args[0];
    if (!field || field.kind !== "string")
      fail(
        "PEEK_FIELD_LITERAL_REQUIRED",
        "Peek requiere el nombre de campo como literal",
      );
    const offset = peekOffset(call.args[1]);
    if (offset.kind === "lag")
      return `LAG(src.${quote(field.value)}, ${offset.amount}) OVER (${window})`;
    return `NTH_VALUE(src.${quote(field.value)}, ${offset.row}) OVER (${window} ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)`;
  }
  if (name === "autonumber") {
    if (call.args.length !== 1)
      fail(
        "AUTONUMBER_SCOPE_UNSUPPORTED",
        "AutoNumber con AutoID requiere preservar el estado entre ámbitos de carga",
      );
    const argument = call.args[0];
    if (!argument) fail("FUNCTION_ARITY", "AutoNumber requiere un argumento");
    const key = imprimirExprClave(argument);
    const index = autoIndexes.get(key);
    if (!index)
      fail(
        "AUTONUMBER_LOWERING_MISSING",
        "No se materializó la clave de AutoNumber",
      );
    return `auto_${index}.__qlik_auto_no_${index}`;
  }
  if (name === "exists")
    fail(
      "EXISTS_PROJECTION_UNSUPPORTED",
      "Exists en una proyección no tiene ámbito de tabla seguro",
    );
  fail(
    "STATEFUL_FUNCTION_UNSUPPORTED",
    `Función inter-record no soportada: ${call.name}`,
  );
}

type PeekWindow =
  | { kind: "lag"; amount: number }
  | { kind: "absolute"; row: number };

function peekOffset(expression: ExprQlik | undefined): PeekWindow {
  if (!expression) return { kind: "lag", amount: 1 };
  if (
    expression.kind === "unary" &&
    expression.operator === "-" &&
    expression.operand.kind === "number"
  ) {
    if (/^\d+$/.test(expression.operand.raw)) {
      const offset = Number(expression.operand.raw);
      if (Number.isSafeInteger(offset) && offset > 0)
        return { kind: "lag", amount: offset };
    }
  }
  if (expression.kind === "number") {
    if (/^\d+$/.test(expression.raw)) {
      const row = Number(expression.raw);
      if (Number.isSafeInteger(row) && row >= 0)
        return { kind: "absolute", row: row + 1 };
    }
  }
  fail(
    "PEEK_OFFSET_UNSUPPORTED",
    "Peek requiere un offset entero literal seguro",
  );
}

function qlikExpr(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  return emitirExpresionBigQuery(expression, "value", environment);
}

function imprimirExprClave(expression: ExprQlik): string {
  return JSON.stringify(expression);
}

function qualifiedValue(
  expression: string,
  environment: EntornoExpresionQlik,
): string {
  const sql = qlikExpr(parsearExpresionQlik(expression), environment);
  return sql.replace(
    /`([^`]+)`/g,
    (_match, identifier: string) => `src.${quote(identifier)}`,
  );
}

function emitirInline(
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

function emitirAutogenerate(
  relation: Extract<RelacionVNext, { op: "autogenerate" }>,
  environment: EntornoExpresionQlik,
): string {
  const fields = emitFields(relation.projections, environment, {}, false);
  if (relation.countExpression === "0")
    return `SELECT\n  ${fields}\nWHERE FALSE`;
  if (relation.countExpression === "1") return `SELECT\n  ${fields}`;
  return `SELECT\n  ${fields}\nFROM UNNEST(GENERATE_ARRAY(1, ${relation.countExpression})) AS _row`;
}

function emitirValorInline(raw: string): string {
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

function emitirFuenteParaProyeccion(
  sourceId: string,
  relation: {
    projections: CampoLoadVNext[];
    mappingLookups?: LookupApplyMapVNext[];
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

function toBinding(lookup: LookupApplyMapVNext): BindingApplyMapQlik {
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

function extraerFromNativoSimple(sql: string): string | undefined {
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
  const flattened = aplanarUnionSimple(relation.inputs, byId);
  if (
    flattened?.every(
      (input) =>
        input.fields.length === relation.fields.length &&
        input.fields.every((field, index) => field === relation.fields[index]),
    )
  )
    return flattened.map((input) => emit(input.id)).join("\nUNION ALL\n");

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

function aplanarUnionSimple(
  inputs: string[],
  byId: Map<string, RelacionVNext>,
): RelacionVNext[] | undefined {
  const flattened: RelacionVNext[] = [];
  for (const id of inputs) {
    const input = byId.get(id);
    if (!input) return undefined;
    if (input.op === "union_all") {
      const nested = aplanarUnionSimple(input.inputs, byId);
      if (!nested) return undefined;
      flattened.push(...nested);
      continue;
    }
    if (input.op !== "inline" && input.op !== "autogenerate") return undefined;
    flattened.push(input);
  }
  return flattened;
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
  relation: {
    dualExpressions?: Record<string, string>;
    dualComponents?: RelacionVNext["dualComponents"];
  },
  includeInternal: boolean,
): string {
  const visible = fields
    .map((field) => {
      if (field.expression === "*") return "*";
      const expression = qlik(field.expression, "value", environment);
      if (sameIdentifier(field.expression, field.alias)) return expression;
      return `${expression} AS ${quote(field.alias)}`;
    })
    .join(",\n  ");
  if (!includeInternal || !relation.dualExpressions) return visible;
  const internals = Object.entries(relation.dualExpressions).flatMap(
    ([alias, expression]) => {
      const components = relation.dualComponents?.[alias] ?? {
        numericField: nombreCampoDual(alias, "numeric"),
        textField: nombreCampoDual(alias, "text"),
      };
      return [
        `${qlik(expression, "numeric_component", environment)} AS ${quote(
          components.numericField,
        )}`,
        ...(components.textField === alias
          ? []
          : [
              `${qlik(expression, "text", environment)} AS ${quote(
                components.textField,
              )}`,
            ]),
      ];
    },
  );
  return [...(visible ? [visible] : []), ...internals].join(",\n  ");
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

function entornoFuente(
  base: EntornoExpresionQlik,
  bindings: ReadonlyMap<string, BindingApplyMapQlik> = new Map(),
): EntornoExpresionQlik {
  return {
    ...base,
    identifierQualifier: "src",
    applyMapBindings: bindings,
  };
}

function entornoProyeccion(
  relation: Extract<RelacionVNext, { op: "project" }>,
  input: RelacionVNext | undefined,
  base: EntornoExpresionQlik,
): EntornoExpresionQlik {
  const lookups = relation.mappingLookups ?? [];
  const bindings = new Map(
    lookups.map((lookup) => [lookup.callKey, toBinding(lookup)]),
  );
  const needsQualifier =
    lookups.length > 0 || Object.keys(input?.dualComponents ?? {}).length > 0;
  return {
    ...base,
    ...(needsQualifier ? { identifierQualifier: "src" } : {}),
    ...(input?.dualComponents ? { dualComponents: input.dualComponents } : {}),
    applyMapBindings: bindings,
  };
}

function extraerEntornoExpresion(
  plan: PlanCompilacionVNext,
): EntornoExpresionQlik {
  const environment: EntornoExpresionQlik = {};
  for (const effect of plan.effects) {
    if (effect.kind !== "define_variable") continue;
    const match = effect.body.match(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/s,
    );
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

import type { EntornoExpresionQlik, ExprQlik } from "../expresiones-qlik.js";
import { parsearExpresionQlik } from "../expresiones-qlik.js";
import type { StatefulLoadVNext } from "../inter-record.js";
import type { RelacionVNext } from "../ir.js";
import { sameIdentifier } from "./relacional.js";
import {
  fail,
  imprimirExprClave,
  indent,
  qlik,
  qlikExpr,
  qualifiedValue,
  quote,
  wrap,
} from "./utilidades.js";

export function emitirRelacionInterRegistro(
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

export function emitirExistsOnly(
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

export function emitirStatefulWhere(
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

export function emitirCampoInterRegistro(
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

export function emitirLlamadaInterRegistro(
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

export type PeekWindow =
  | { kind: "lag"; amount: number }
  | { kind: "absolute"; row: number };

export function peekOffset(expression: ExprQlik | undefined): PeekWindow {
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

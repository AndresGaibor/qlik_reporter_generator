import { type ExprQlik, parsearExpresionQlik } from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import type { CampoLoadVNext, OrdenLoadVNext } from "./parser-carga.js";

export type InterRecordOperationKind =
  | "exists"
  | "row_no"
  | "rec_no"
  | "iter_no"
  | "peek"
  | "previous"
  | "autonumber"
  | "autonumber_hash";

export interface InterRecordOperation {
  kind: InterRecordOperationKind;
  expression: string;
  call: Extract<ExprQlik, { kind: "call" }>;
}

export interface ExistsUsage {
  field: string;
  valueExpression: string;
}

export interface InterRecordUsage {
  operations: InterRecordOperation[];
  requiresOrder: boolean;
  exists?: ExistsUsage;
}

export interface StatefulLoadVNext {
  projections: CampoLoadVNext[];
  distinct: boolean;
  where?: string;
  exists?: ExistsUsage & { against: string };
  orderBy: OrdenLoadVNext[];
  iterationCount: number;
  operations: InterRecordOperation[];
}

const STATEFUL_NAMES = new Map<string, InterRecordOperationKind>([
  ["exists", "exists"],
  ["rowno", "row_no"],
  ["recno", "rec_no"],
  ["iterno", "iter_no"],
  ["peek", "peek"],
  ["previous", "previous"],
  ["autonumber", "autonumber"],
  ["autonumberhash128", "autonumber_hash"],
  ["autonumberhash256", "autonumber_hash"],
]);

const ORDER_SENSITIVE = new Set<InterRecordOperationKind>([
  "row_no",
  "rec_no",
  "iter_no",
  "peek",
  "previous",
  "autonumber",
]);

export function analizarUsoInterRegistro(
  fields: readonly CampoLoadVNext[],
  where?: string,
): InterRecordUsage {
  const operations: InterRecordOperation[] = [];
  for (const field of fields) {
    const expression = parsearExpresionQlik(field.expression);
    const stateful = encontrarLlamadasInterRegistro(expression);
    if (stateful.length === 0) continue;
    if (stateful.length !== 1 || stateful[0]?.kind === "exists") {
      if (stateful.some((operation) => operation.kind === "exists"))
        fail(
          "EXISTS_PROJECTION_UNSUPPORTED",
          "Exists en una proyección requiere un ámbito de tabla explícito; úsalo en WHERE",
        );
      if (stateful.length !== 1 || stateful[0]?.call !== expression)
        fail(
          "STATEFUL_NESTING_UNSUPPORTED",
          "Las funciones inter-record solo se soportan como expresión LOAD de primer nivel",
        );
    }
    const operation = stateful[0];
    if (!operation) continue;
    operations.push({
      kind: operation.kind,
      expression: field.expression,
      call: operation.call,
    });
  }

  let exists: ExistsUsage | undefined;
  if (where) {
    const expression = parsearExpresionQlik(where);
    const stateful = encontrarLlamadasInterRegistro(expression);
    const root =
      stateful.length === 1 && stateful[0]?.call === expression
        ? stateful[0]
        : undefined;
    if (stateful.some((operation) => operation.kind === "exists") && !root)
      fail(
        "EXISTS_COMBINED_PREDICATE_UNSUPPORTED",
        "Exists combinado con otros predicados requiere preservar el orden de evaluación Qlik",
      );
    if (root?.kind === "exists") {
      exists = analizarExists(root.call);
      operations.push({ kind: "exists", expression: where, call: root.call });
    }
    if (stateful.some((operation) => operation.kind !== "exists"))
      fail(
        "STATEFUL_WHERE_UNSUPPORTED",
        "Las funciones inter-record en WHERE requieren una carga materializada explícita",
      );
  }

  return {
    operations,
    requiresOrder: operations.some((operation) =>
      ORDER_SENSITIVE.has(operation.kind),
    ),
    ...(exists ? { exists } : {}),
  };
}

export function interpretarWhileIterNo(condition?: string): number | undefined {
  if (!condition) return 1;
  const match = condition.trim().match(/^IterNo\(\)\s*(<=|<)\s*(\d+)$/i);
  if (!match?.[1] || !match[2]) return undefined;
  const limit = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(limit) || limit < 1) return undefined;
  return match[1] === "<" ? limit - 1 : limit;
}

export function extraerOrdenSql(sql: string): OrdenLoadVNext[] | undefined {
  const orderAt = encontrarKeywordTopLevel(sql, "ORDER BY");
  if (orderAt < 0) return undefined;
  const rest = sql.slice(orderAt + "ORDER BY".length);
  const end =
    [
      encontrarKeywordTopLevel(rest, "LIMIT"),
      encontrarKeywordTopLevel(rest, "OFFSET"),
    ]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0] ?? rest.length;
  const orderText = rest.slice(0, end).trim();
  if (!orderText) return undefined;
  const parts = dividirTopLevel(orderText);
  const orderBy = parts.map((part) => {
    const match = part.match(/^(.*?)(?:\s+(ASC|DESC))?\s*$/i);
    return {
      expression: match?.[1]?.trim() || part.trim(),
      direction: match?.[2]?.toLowerCase() === "desc" ? "desc" : "asc",
    } satisfies OrdenLoadVNext;
  });
  return orderBy.length > 0 ? orderBy : undefined;
}

function encontrarLlamadasInterRegistro(
  expression: ExprQlik,
): InterRecordOperation[] {
  switch (expression.kind) {
    case "call": {
      const kind = STATEFUL_NAMES.get(expression.name.toLowerCase());
      const own = kind
        ? [
            {
              kind,
              expression: "",
              call: expression,
            } satisfies InterRecordOperation,
          ]
        : [];
      return [
        ...own,
        ...expression.args.flatMap(encontrarLlamadasInterRegistro),
      ];
    }
    case "unary":
      return encontrarLlamadasInterRegistro(expression.operand);
    case "binary":
      return [
        ...encontrarLlamadasInterRegistro(expression.left),
        ...encontrarLlamadasInterRegistro(expression.right),
      ];
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return [];
  }
}

function analizarExists(
  call: Extract<ExprQlik, { kind: "call" }>,
): ExistsUsage {
  if (call.args.length < 1 || call.args.length > 2)
    fail("FUNCTION_ARITY", "Exists requiere uno o dos argumentos");
  const field = call.args[0];
  if (!field || field.kind !== "identifier")
    fail(
      "EXISTS_FIELD_LITERAL_REQUIRED",
      "Exists requiere el nombre de campo como primer argumento",
    );
  return {
    field: field.name,
    valueExpression: call.args[1]
      ? imprimirExpresion(call.args[1])
      : field.name,
  };
}

function imprimirExpresion(expression: ExprQlik): string {
  switch (expression.kind) {
    case "identifier":
      return expression.name;
    case "number":
      return expression.raw;
    case "string":
      return `'${expression.value.replace(/'/g, "''")}'`;
    case "variable":
      return `$(${expression.name})`;
    case "wildcard":
      return "*";
    case "call":
      return `${expression.name}(${expression.args.map(imprimirExpresion).join(", ")})`;
    case "unary":
      return `${expression.operator} ${imprimirExpresion(expression.operand)}`;
    case "binary":
      return `${imprimirExpresion(expression.left)} ${expression.operator} ${imprimirExpresion(expression.right)}`;
  }
}

function encontrarKeywordTopLevel(sql: string, keyword: string): number {
  let depth = 0;
  let quote: string | undefined;
  let bracket = false;
  for (let index = 0; index <= sql.length - keyword.length; index += 1) {
    const char = sql[index] ?? "";
    const next = sql[index + 1] ?? "";
    if (bracket) {
      if (char === "]") bracket = false;
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) index += 1;
        else quote = undefined;
      }
      continue;
    }
    if (char === "[") {
      bracket = true;
      continue;
    }
    if (["'", '"', "`"].includes(char)) {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (
      depth !== 0 ||
      sql.slice(index, index + keyword.length).toUpperCase() !== keyword
    )
      continue;
    const before = sql[index - 1] ?? " ";
    const after = sql[index + keyword.length] ?? " ";
    if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after))
      return index;
  }
  return -1;
}

function dividirTopLevel(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else quote = undefined;
      }
      continue;
    }
    if (["'", '"', "`"].includes(char)) quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function fail(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category: "UNSUPPORTED_SEMANTICS",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}

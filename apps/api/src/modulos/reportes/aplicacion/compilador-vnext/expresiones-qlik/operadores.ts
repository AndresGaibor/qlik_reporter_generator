import {
  emitNumericComponent,
  emitNumericValue,
  emitTextValue,
  emitValue,
} from "./core-valores.js";
import { serializarExpresionQlik } from "./dual.js";
import { qlikNumeric } from "./numericas.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  parenthesize,
  quoteIdentifier,
  requiredArgument,
} from "./utilidades.js";

export function emitUnary(
  expression: Extract<ExprQlik, { kind: "unary" }>,
  environment: EntornoExpresionQlik,
): string {
  const operand = emitValue(expression.operand, environment);
  if (expression.operator === "+")
    return `+${parenthesize(emitNumericValue(expression.operand, environment))}`;
  if (expression.operator === "-")
    return `-${parenthesize(emitNumericValue(expression.operand, environment))}`;
  if (expression.operator === "not")
    return `CASE WHEN ${emitCondition(expression.operand, environment)} THEN 0 ELSE -1 END`;
  if (expression.operator === "bitnot")
    return qlikInt32(`~(${qlikInt32(operand)})`);
  fail(
    "OPERATOR_NOT_RUNTIME_IMPLEMENTED",
    `Operador ${expression.operator} aún no implementado`,
    expression.operator,
    0,
  );
}

export function emitBinary(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const op = expression.operator;
  if (["+", "-", "*", "/"].includes(op)) {
    return emitNumericValue(expression, environment);
  }
  if (op === "&") return emitConcat(expression, environment);
  if (["bitand", "bitor", "bitxor", "<<", ">>"].includes(op))
    return emitBitwiseBinary(expression, environment);
  if (["=", "<>", "<", ">", "<=", ">=", "precedes", "follows"].includes(op)) {
    return `CASE WHEN ${emitComparisonCondition(expression, environment)} THEN -1 WHEN ${emitComparisonNullCase(expression, environment)} THEN NULL ELSE 0 END`;
  }
  if (["and", "or", "xor"].includes(op)) {
    const condition = emitLogicalCondition(expression, environment);
    return `CASE WHEN ${condition} THEN -1 ELSE 0 END`;
  }
  fail(
    "OPERATOR_NOT_RUNTIME_IMPLEMENTED",
    `Operador ${op} aún no implementado`,
    op,
    0,
  );
}

export function qlikInt32(sql: string): string {
  const numeric = qlikNumeric(sql);
  const truncated = `TRUNC(${numeric})`;
  const unsigned = `MOD(MOD(${truncated}, 4294967296) + 4294967296, 4294967296)`;
  return `CASE WHEN ${numeric} IS NULL THEN NULL WHEN ${unsigned} >= 2147483648 THEN CAST(${unsigned} - 4294967296 AS INT64) ELSE CAST(${unsigned} AS INT64) END`;
}

export function emitApplyMap(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
  context: "value" | "numeric" | "numeric_component" | "text",
): string {
  arityRange(expression.name, expression.args, 2, 3);
  const keyExpression = expression.args[1];
  if (!keyExpression)
    fail(
      "FUNCTION_ARITY",
      `${expression.name} requiere una expresión de clave`,
      expression.name,
      0,
    );
  const binding = environment.applyMapBindings?.get(
    serializarExpresionQlik(expression),
  );
  if (!binding)
    fail(
      "APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING",
      "ApplyMap requiere MAPPING y representación dual tipada para preservar hit NULL, default y componente numérico",
      expression.name,
      0,
    );

  const hit = `${binding.alias}.${quoteIdentifier(binding.hitField)}`;
  const valueField =
    context === "numeric" || context === "numeric_component"
      ? binding.lookupNumericField
      : binding.lookupTextField;
  const mapped = `${binding.alias}.${quoteIdentifier(valueField)}`;
  const fallbackExpression = binding.defaultExpression ?? binding.keyExpression;
  const fallback =
    context === "numeric_component"
      ? emitNumericComponent(fallbackExpression, environment)
      : context === "numeric"
        ? emitNumericValue(fallbackExpression, environment)
        : emitTextValue(fallbackExpression, environment);
  return `CASE WHEN ${hit} THEN ${mapped} ELSE ${fallback} END`;
}

export function emitBitwiseBinary(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  if (expression.operator === ">>")
    fail(
      "OPERATOR_RIGHT_SHIFT_REQUIRES_REFERENCE_VECTOR",
      "Qlik usa signed-32 pero no documenta la extensión de signo para >> sobre negativos",
      expression.operator,
      0,
    );
  const left = qlikInt32(emitValue(expression.left, environment));
  const right = qlikInt32(emitValue(expression.right, environment));
  const operator =
    expression.operator === "bitand"
      ? "&"
      : expression.operator === "bitor"
        ? "|"
        : expression.operator === "bitxor"
          ? "^"
          : "<<";
  if (operator === "<<")
    return `CASE WHEN ${left} IS NULL OR ${right} IS NULL OR ${right} < 0 THEN NULL WHEN ${right} >= 32 THEN 0 ELSE ${qlikInt32(`(${left}) << (${right})`)} END`;
  return qlikInt32(`(${left}) ${operator} (${right})`);
}

export function emitCondition(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (
    expression.kind === "call" &&
    expression.name.toLowerCase() === "isnull"
  ) {
    arity(expression.name, expression.args, 1);
    return `${emitValue(requiredArgument(expression.args[0]), environment)} IS NULL`;
  }
  if (expression.kind === "binary") {
    if (
      ["=", "<>", "<", ">", "<=", ">=", "precedes", "follows"].includes(
        expression.operator,
      )
    )
      return emitComparisonCondition(expression, environment);
    if (["and", "or", "xor"].includes(expression.operator))
      return emitLogicalCondition(expression, environment);
  }
  if (expression.kind === "unary" && expression.operator === "not")
    return `NOT (${emitCondition(expression.operand, environment)})`;
  return `COALESCE(${emitNumericComponent(expression, environment)} != 0, FALSE)`;
}

export function emitComparisonCondition(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitComparisonOperand(
    expression.left,
    expression.right,
    environment,
  );
  const right = emitComparisonOperand(
    expression.right,
    expression.left,
    environment,
  );
  if (expression.operator === "precedes" || expression.operator === "follows") {
    const op = expression.operator === "precedes" ? "<" : ">";
    return `CAST(${left} AS STRING) ${op} CAST(${right} AS STRING)`;
  }
  if (expression.operator === "<>")
    return `((${left} IS NULL) != (${right} IS NULL) OR ${left} != ${right})`;
  return `${left} ${expression.operator} ${right}`;
}

export function emitComparisonOperand(
  expression: ExprQlik,
  other: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (
    expression.kind === "string" &&
    other.kind === "identifier" &&
    environment.dateFormat
  ) {
    const iso = parseQlikDateLiteral(expression.value, environment.dateFormat);
    if (iso) return `DATE '${iso}'`;
  }
  return emitValue(expression, environment);
}

export function parseQlikDateLiteral(
  value: string,
  format: string,
): string | undefined {
  let year: number;
  let month: number;
  let day: number;
  let match: RegExpMatchArray | null = null;

  if (format === "M/D/YYYY" || format === "MM/DD/YYYY") {
    match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return undefined;
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  } else if (format === "YYYY-MM-DD") {
    match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return undefined;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function emitComparisonNullCase(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitValue(expression.left, environment);
  const right = emitValue(expression.right, environment);
  return `${left} IS NULL AND ${right} IS NULL`;
}

export function emitLogicalCondition(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitCondition(expression.left, environment);
  const right = emitCondition(expression.right, environment);
  if (expression.operator === "and") return `(${left} AND ${right})`;
  if (expression.operator === "or") return `(${left} OR ${right})`;
  if (expression.operator === "xor")
    return `((${left}) AND NOT (${right})) OR (NOT (${left}) AND (${right}))`;
  fail(
    "OPERATOR_NOT_RUNTIME_IMPLEMENTED",
    `Operador ${expression.operator} no implementado`,
    expression.operator,
    0,
  );
}

export function emitConcat(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const parts: ExprQlik[] = [];
  collectConcat(expression, parts);
  const values = parts.map((part) => emitValue(part, environment));
  const allNull = values.map((value) => `${value} IS NULL`).join(" AND ");
  const args = values
    .map((value) => `COALESCE(CAST(${value} AS STRING), '')`)
    .join(", ");
  return `CASE WHEN ${allNull} THEN NULL ELSE CONCAT(${args}) END`;
}

export function collectConcat(expression: ExprQlik, out: ExprQlik[]): void {
  if (expression.kind === "binary" && expression.operator === "&") {
    collectConcat(expression.left, out);
    collectConcat(expression.right, out);
    return;
  }
  out.push(expression);
}

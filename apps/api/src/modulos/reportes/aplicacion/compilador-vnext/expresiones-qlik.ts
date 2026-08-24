import { ErrorCompilacionVNext } from "./modelo.js";
import { obtenerFuncionQlik } from "./registro-funciones.js";

export type ExprQlik =
  | { kind: "number"; raw: string }
  | { kind: "string"; value: string }
  | { kind: "identifier"; name: string }
  | { kind: "variable"; name: string }
  | { kind: "wildcard" }
  | { kind: "call"; name: string; args: ExprQlik[]; modifiers?: string[] }
  | { kind: "unary"; operator: string; operand: ExprQlik }
  | { kind: "binary"; operator: string; left: ExprQlik; right: ExprQlik };

type TokenKind =
  | "number" | "string" | "identifier" | "variable" | "operator"
  | "lparen" | "rparen" | "comma" | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  value?: string;
  offset: number;
}

const WORD_OPERATORS = new Set([
  "and", "or", "xor", "not", "bitnot", "bitand", "bitor", "bitxor",
  "precedes", "follows", "like",
]);

const PRECEDENCE: Record<string, number> = {
  or: 10,
  xor: 15,
  and: 20,
  "=": 30, "<>": 30, "<": 30, ">": 30, "<=": 30, ">=": 30,
  precedes: 30, follows: 30, like: 30,
  "&": 35,
  bitor: 37, bitxor: 38, bitand: 39,
  ">>": 40, "<<": 40,
  "+": 50, "-": 50,
  "*": 60, "/": 60,
};

export function parsearExpresionQlik(text: string): ExprQlik {
  const tokens = tokenize(text);
  let index = 0;
  const current = () => tokens[index] ?? tokens[tokens.length - 1]!;
  const consume = () => tokens[index++] ?? tokens[tokens.length - 1]!;

  const parseExpression = (minPrecedence = 0): ExprQlik => {
    let left = parsePrefix();
    while (current().kind === "operator") {
      const operator = current().text.toLowerCase();
      const precedence = PRECEDENCE[operator];
      if (precedence === undefined || precedence < minPrecedence) break;
      consume();
      const right = parseExpression(precedence + 1);
      left = { kind: "binary", operator, left, right };
    }
    return left;
  };

  const parsePrefix = (): ExprQlik => {
    const token = consume();
    if (token.kind === "number") return { kind: "number", raw: token.text };
    if (token.kind === "string") return { kind: "string", value: token.value ?? "" };
    if (token.kind === "variable") return { kind: "variable", name: token.value ?? token.text };
    if (token.kind === "operator" && token.text === "*") return { kind: "wildcard" };
    if (token.kind === "operator" && ["+", "-", "not", "bitnot"].includes(token.text.toLowerCase())) {
      const operator = token.text.toLowerCase();
      const operandPrecedence = operator === "not" ? 25 : 70;
      return { kind: "unary", operator, operand: parseExpression(operandPrecedence) };
    }
    if (token.kind === "lparen") {
      const expression = parseExpression();
      expectToken(consume(), "rparen", text);
      return expression;
    }
    if (token.kind !== "identifier") fail("EXPRESSION_EXPECTED", `Se esperaba una expresión y se encontró ${token.text}`, text, token.offset);

    const name = token.value ?? token.text;
    if (current().kind !== "lparen") return { kind: "identifier", name };
    consume();
    const modifiers: string[] = [];
    while (current().kind === "identifier") {
      const modifier = (current().value ?? current().text).toLowerCase();
      if (!new Set(["distinct", "total"]).has(modifier)) break;
      modifiers.push(modifier);
      consume();
    }
    const args: ExprQlik[] = [];
    if (current().kind !== "rparen") {
      while (true) {
        args.push(parseExpression());
        if (current().kind !== "comma") break;
        consume();
      }
    }
    expectToken(consume(), "rparen", text);
    return { kind: "call", name, args, ...(modifiers.length > 0 ? { modifiers } : {}) };
  };

  const expression = parseExpression();
  if (current().kind !== "eof") fail("EXPRESSION_UNCONSUMED_TOKENS", `Token no consumido: ${current().text}`, text, current().offset);
  return expression;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? "";
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "'") {
      const start = i++;
      let value = "";
      let closed = false;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] !== "'") {
          i += 1;
          closed = true;
          break;
        }
        if (text[i] === "'" && text[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        value += text[i++] ?? "";
      }
      if (!closed)
        fail("EXPRESSION_UNTERMINATED_STRING", "String Qlik sin cerrar", text, start);
      out.push({
        kind: "string",
        text: text.slice(start, i),
        value,
        offset: start,
      });
      continue;
    }

    if (c === "[") {
      const start = i++;
      let value = "";
      while (i < text.length && text[i] !== "]") value += text[i++] ?? "";
      if (text[i] !== "]")
        fail("EXPRESSION_UNTERMINATED_IDENTIFIER", "Identificador [..] sin cerrar", text, start);
      i += 1;
      out.push({ kind: "identifier", text: text.slice(start, i), value, offset: start });
      continue;
    }

    if (c === '"' || c === "`") {
      const start = i++;
      const quote = c;
      let value = "";
      while (i < text.length && text[i] !== quote) value += text[i++] ?? "";
      if (text[i] !== quote)
        fail("EXPRESSION_UNTERMINATED_IDENTIFIER", "Identificador quoted sin cerrar", text, start);
      i += 1;
      out.push({ kind: "identifier", text: text.slice(start, i), value, offset: start });
      continue;
    }

    if (c === "$" && text[i + 1] === "(") {
      const start = i;
      i += 2;
      const close = text.indexOf(")", i);
      if (close < 0) fail("EXPRESSION_UNTERMINATED_VARIABLE", "Dollar expansion sin cerrar", text, start);
      const value = text.slice(i, close).trim();
      i = close + 1;
      out.push({ kind: "variable", text: text.slice(start, i), value, offset: start });
      continue;
    }

    if (c === "(") { out.push({ kind: "lparen", text: c, offset: i++ }); continue; }
    if (c === ")") { out.push({ kind: "rparen", text: c, offset: i++ }); continue; }
    if (c === ",") { out.push({ kind: "comma", text: c, offset: i++ }); continue; }

    if (/\d/.test(c) || (c === "." && /\d/.test(text[i + 1] ?? ""))) {
      const start = i;
      i += 1;
      while (i < text.length && /[0-9.]/.test(text[i] ?? "")) i += 1;
      if (/[eE]/.test(text[i] ?? "")) {
        i += 1;
        if (/[+-]/.test(text[i] ?? "")) i += 1;
        while (i < text.length && /\d/.test(text[i] ?? "")) i += 1;
      }
      out.push({ kind: "number", text: text.slice(start, i), offset: start });
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const start = i++;
      while (i < text.length && /[A-Za-z0-9_.$]/.test(text[i] ?? "")) i += 1;
      const word = text.slice(start, i);
      const lower = word.toLowerCase();
      out.push({
        kind: WORD_OPERATORS.has(lower) ? "operator" : "identifier",
        text: word,
        value: word,
        offset: start,
      });
      continue;
    }

    const symbolic = ["<=", ">=", "<>", "<<", ">>", "+", "-", "*", "/", "&", "=", "<", ">"].find(
      (operator) => text.startsWith(operator, i),
    );
    if (symbolic) {
      out.push({ kind: "operator", text: symbolic, offset: i });
      i += symbolic.length;
      continue;
    }
    fail("EXPRESSION_UNKNOWN_TOKEN", `Token Qlik no reconocido: ${c}`, text, i);
  }
  out.push({ kind: "eof", text: "", offset: text.length });
  return out;
}

function expectToken(token: Token, kind: TokenKind, source: string): void {
  if (token.kind !== kind)
    fail("EXPRESSION_UNEXPECTED_TOKEN", `Se esperaba ${kind} y se encontró ${token.text}`, source, token.offset);
}

function quoteIdentifier(name: string): string {
  if (!name || name.includes("`"))
    fail("EXPRESSION_INVALID_IDENTIFIER", `Identificador inválido: ${name}`, name, 0);
  return `\`${name}\``;
}

function qualifiedIdentifier(
  name: string,
  environment: EntornoExpresionQlik,
): string {
  const identifier = quoteIdentifier(name);
  return environment.identifierQualifier
    ? `${environment.identifierQualifier}.${identifier}`
    : identifier;
}

export type ContextoExpresion =
  | "value"
  | "numeric"
  | "numeric_component"
  | "text"
  | "condition";

export interface ComponentesDualQlik {
  numericField: string;
  textField: string;
}

export interface BindingApplyMapQlik {
  callKey: string;
  alias: string;
  hitField: string;
  lookupValueField: string;
  lookupNumericField: string;
  lookupTextField: string;
  defaultExpression?: ExprQlik;
  keyExpression: ExprQlik;
}

export interface EntornoExpresionQlik {
  dateFormat?: string;
  timeFormat?: string;
  timestampFormat?: string;
  monthNames?: readonly string[];
  dayNames?: readonly string[];
  decimalSep?: string;
  thousandSep?: string;
  firstWeekDay?: number;
  brokenWeeks?: number;
  referenceDay?: number;
  firstMonthOfYear?: number;
  identifierQualifier?: string;
  dualComponents?: Readonly<Record<string, ComponentesDualQlik>>;
  applyMapBindings?: ReadonlyMap<string, BindingApplyMapQlik>;
}

const DUAL_FUNCTIONS = new Set([
  "date", "month", "monthstart", "monthend", "quarterstart", "quarterend", "yearstart", "yearend", "daystart", "dayend", "weekday", "makedate", "maketime",
  "addyears", "addmonths", "num", "jsonget", "jsonset", "applymap",
]);

export function esExpresionDualQlik(expression: string): boolean {
  return contieneFuncionDual(parsearExpresionQlik(expression));
}

export function contieneApplyMapQlik(expression: ExprQlik): boolean {
  switch (expression.kind) {
    case "call":
      return (
        expression.name.toLowerCase() === "applymap" ||
        expression.args.some(contieneApplyMapQlik)
      );
    case "unary":
      return contieneApplyMapQlik(expression.operand);
    case "binary":
      return (
        contieneApplyMapQlik(expression.left) ||
        contieneApplyMapQlik(expression.right)
      );
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return false;
  }
}

export function esApplyMapDirectoQlik(expression: ExprQlik): boolean {
  return expression.kind === "call" && expression.name.toLowerCase() === "applymap";
}

export function serializarExpresionQlik(expression: ExprQlik): string {
  return JSON.stringify(expression);
}

function contieneFuncionDual(expression: ExprQlik): boolean {
  switch (expression.kind) {
    case "call":
      return (
        DUAL_FUNCTIONS.has(expression.name.toLowerCase()) ||
        expression.args.some(contieneFuncionDual)
      );
    case "unary":
      return contieneFuncionDual(expression.operand);
    case "binary":
      return (
        contieneFuncionDual(expression.left) ||
        contieneFuncionDual(expression.right)
      );
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return false;
  }
}

export function emitirExpresionBigQuery(
  expression: ExprQlik,
  context: ContextoExpresion = "value",
  environment: EntornoExpresionQlik = {},
): string {
  if (context === "condition") return emitCondition(expression, environment);
  if (context === "numeric") return emitNumericValue(expression, environment);
  if (context === "numeric_component")
    return emitNumericComponent(expression, environment);
  if (context === "text") return emitTextValue(expression, environment);
  return emitValue(expression, environment);
}

function emitNumericComponent(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.numericField, environment);
    return qlikNumeric(qualifiedIdentifier(expression.name, environment));
  }
  if (expression.kind === "call" && expression.name.toLowerCase() === "null")
    return "NULL";
  if (expression.kind === "call" && expression.name.toLowerCase() === "applymap")
    return emitApplyMap(expression, environment, "numeric_component");
  return emitNumericValue(expression, environment);
}

function emitTextValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.textField, environment);
  }
  if (expression.kind === "call" && expression.name.toLowerCase() === "applymap")
    return emitApplyMap(expression, environment, "text");
  if (expression.kind === "string") return quoteString(expression.value);
  if (expression.kind === "call" && expression.name.toLowerCase() === "null")
    return emitValue(expression, environment);
  return `CAST(${emitValue(expression, environment)} AS STRING)`;
}

function emitValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  switch (expression.kind) {
    case "number": return expression.raw;
    case "string": return quoteString(expression.value);
    case "identifier": return qualifiedIdentifier(expression.name, environment);
    case "variable":
      fail("VARIABLE_UNRESOLVED", `Variable $(${expression.name}) no resuelta`, expression.name, 0);
    case "wildcard":
      fail("WILDCARD_OUTSIDE_AGGREGATION", "* solo puede emitirse en un contexto que lo admita", "*", 0);
    case "call": return emitCall(expression, environment);
    case "unary": return emitUnary(expression, environment);
    case "binary": return emitBinary(expression, environment);
  }
}

function emitNumericValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "number") return expression.raw;
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.numericField, environment);
    const identifier = qualifiedIdentifier(expression.name, environment);
    return environment.identifierQualifier
      ? identifier
      : qlikNumericOrTemporal(identifier);
  }
  if (expression.kind === "unary" && ["+", "-"].includes(expression.operator)) {
    const operand = emitNumericValue(expression.operand, environment);
    return `${expression.operator}${parenthesize(operand)}`;
  }
  if (expression.kind === "binary" && ["+", "-", "*", "/"].includes(expression.operator)) {
    const left = emitNumericValue(expression.left, environment);
    const right = emitNumericValue(expression.right, environment);
    return `${emitNumericOperand(expression.left, left, expression.operator, "left")} ${expression.operator} ${emitNumericOperand(expression.right, right, expression.operator, "right")}`;
  }
  if (expression.kind === "call") {
    const name = expression.name.toLowerCase();
    if (name === "applymap") return emitApplyMap(expression, environment, "numeric");
    if (name === "date" || name === "num") {
      if (expression.args.length < 1)
        fail("FUNCTION_ARITY", `${expression.name} requiere al menos un argumento`, expression.name, 0);
      return qlikNumericOrTemporal(emitValue(expression.args[0]!, environment));
    }
    if (name === "month") {
      arity(expression.name, expression.args, 1);
      return `EXTRACT(MONTH FROM ${qlikDateFromAny(emitValue(expression.args[0]!, environment))})`;
    }
    if (name === "monthstart") {
      arityRange(expression.name, expression.args, 1, 2);
      const date = qlikDateFromAny(emitValue(expression.args[0]!, environment));
      const period = expression.args[1]
        ? emitNumericValue(expression.args[1], environment)
        : "0";
      const start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL CAST(${period} AS INT64) MONTH)`;
      return `CAST(DATE_DIFF(${start}, DATE '1899-12-30', DAY) AS BIGNUMERIC)`;
    }
    if (["daystart", "dayend"].includes(name))
      return qlikSerialFromTimestamp(
        emitDayBoundaryTimestamp(name, expression.name, expression.args, environment),
      );
    if (["monthend", "quarterstart", "quarterend", "yearstart", "yearend"].includes(name))
      return qlikSerialFromTimestamp(
        emitPeriodBoundaryTimestamp(name, expression.name, expression.args, environment),
      );
    if (name === "weekday")
      return weekDayParts(expression.name, expression.args, environment).numeric;
    if (name === "jsonget") {
      arity(expression.name, expression.args, 2);
      return `LAX_FLOAT64(${emitJsonGetRaw(expression.name, expression.args, environment)})`;
    }
    if (name === "jsonset")
      return `LAX_FLOAT64(${emitJsonSetRaw(expression.name, expression.args, environment)})`;
    if (name === "maketime") {
      const time = emitMakeTimeRaw(expression.name, expression.args, environment);
      return `SAFE_DIVIDE(CAST(TIME_DIFF(${time}, TIME '00:00:00', MICROSECOND) AS BIGNUMERIC), 86400000000)`;
    }
    if (["makedate", "addyears", "addmonths"].includes(name)) {
      const date = emitDualDateRaw(name, expression.name, expression.args, environment);
      return `CAST(DATE_DIFF(${date}, DATE '1899-12-30', DAY) AS BIGNUMERIC)`;
    }
  }
  return qlikNumericOrTemporal(emitValue(expression, environment));
}

function emitNumericOperand(
  expression: ExprQlik,
  sql: string,
  parentOperator: string,
  side: "left" | "right",
): string {
  if (expression.kind !== "binary" || !["+", "-", "*", "/"].includes(expression.operator))
    return sql;
  const childPrecedence = expression.operator === "*" || expression.operator === "/" ? 2 : 1;
  const parentPrecedence = parentOperator === "*" || parentOperator === "/" ? 2 : 1;
  if (childPrecedence < parentPrecedence || (side === "right" && childPrecedence === parentPrecedence))
    return `(${sql})`;
  return sql;
}

function emitNumericArgument(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (
    (expression.kind === "binary" && ["+", "-", "*", "/"].includes(expression.operator)) ||
    (expression.kind === "unary" && ["+", "-"].includes(expression.operator))
  )
    return emitNumericValue(expression, environment);
  return qlikNumeric(emitValue(expression, environment));
}

function emitUnary(
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
  fail("OPERATOR_NOT_RUNTIME_IMPLEMENTED", `Operador ${expression.operator} aún no implementado`, expression.operator, 0);
}

function emitBinary(
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
  fail("OPERATOR_NOT_RUNTIME_IMPLEMENTED", `Operador ${op} aún no implementado`, op, 0);
}

function qlikInt32(sql: string): string {
  const numeric = qlikNumeric(sql);
  const truncated = `TRUNC(${numeric})`;
  const unsigned = `MOD(MOD(${truncated}, 4294967296) + 4294967296, 4294967296)`;
  return `CASE WHEN ${numeric} IS NULL THEN NULL WHEN ${unsigned} >= 2147483648 THEN CAST(${unsigned} - 4294967296 AS INT64) ELSE CAST(${unsigned} AS INT64) END`;
}

function emitApplyMap(
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

function emitBitwiseBinary(
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

function emitCondition(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "call" && expression.name.toLowerCase() === "isnull") {
    arity(expression.name, expression.args, 1);
    return `${emitValue(expression.args[0]!, environment)} IS NULL`;
  }
  if (expression.kind === "binary") {
    if (["=", "<>", "<", ">", "<=", ">=", "precedes", "follows"].includes(expression.operator))
      return emitComparisonCondition(expression, environment);
    if (["and", "or", "xor"].includes(expression.operator))
      return emitLogicalCondition(expression, environment);
  }
  if (expression.kind === "unary" && expression.operator === "not")
    return `NOT (${emitCondition(expression.operand, environment)})`;
  return `COALESCE(${emitNumericComponent(expression, environment)} != 0, FALSE)`;
}

function emitComparisonCondition(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitValue(expression.left, environment);
  const right = emitValue(expression.right, environment);
  if (expression.operator === "precedes" || expression.operator === "follows") {
    const op = expression.operator === "precedes" ? "<" : ">";
    return `CAST(${left} AS STRING) ${op} CAST(${right} AS STRING)`;
  }
  if (expression.operator === "<>")
    return `((${left} IS NULL) != (${right} IS NULL) OR ${left} != ${right})`;
  return `${left} ${expression.operator} ${right}`;
}

function emitComparisonNullCase(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitValue(expression.left, environment);
  const right = emitValue(expression.right, environment);
  return `${left} IS NULL AND ${right} IS NULL`;
}

function emitLogicalCondition(
  expression: Extract<ExprQlik, { kind: "binary" }>,
  environment: EntornoExpresionQlik,
): string {
  const left = emitCondition(expression.left, environment);
  const right = emitCondition(expression.right, environment);
  if (expression.operator === "and") return `(${left} AND ${right})`;
  if (expression.operator === "or") return `(${left} OR ${right})`;
  if (expression.operator === "xor")
    return `((${left}) AND NOT (${right})) OR (NOT (${left}) AND (${right}))`;
  fail("OPERATOR_NOT_RUNTIME_IMPLEMENTED", `Operador ${expression.operator} no implementado`, expression.operator, 0);
}

function emitConcat(
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

function collectConcat(expression: ExprQlik, out: ExprQlik[]): void {
  if (expression.kind === "binary" && expression.operator === "&") {
    collectConcat(expression.left, out);
    collectConcat(expression.right, out);
    return;
  }
  out.push(expression);
}

function emitCall(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const registered = obtenerFuncionQlik(expression.name);
  if (!registered)
    fail(
      "FUNCTION_NOT_IN_OFFICIAL_INVENTORY",
      `La función ${expression.name} no existe en el inventario oficial Qlik`,
      expression.name,
      0,
    );

  const name = expression.name.toLowerCase();
  const args = expression.args;
  if (["hash128", "hash160", "hash256"].includes(name))
    fail(
      "FUNCTION_REQUIRES_QLIK_HASH_UDF",
      `${expression.name} usa el hash propietario de Qlik y requiere una UDF exacta verificada`,
      expression.name,
      0,
    );
  if (["coalesce", "pick", "class"].includes(name))
    fail(
      "FUNCTION_REQUIRES_TYPED_LOWERING",
      `${expression.name} puede producir valores duales/heterogéneos y requiere lowering con tipos Qlik explícitos`,
      expression.name,
      0,
    );
  if (["mixmatch", "wildmatch"].includes(name))
    fail(
      "FUNCTION_REQUIRES_QLIK_COLLATION",
      `${expression.name} requiere la collation Qlik exacta, incluida equivalencia Hiragana/Katakana`,
      expression.name,
      0,
    );
  if (
    name === "applymap" &&
    environment.applyMapBindings?.has(serializarExpresionQlik(expression))
  )
    return emitApplyMap(expression, environment, "value");
  if (name === "applymap")
    fail(
      "APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING",
      "ApplyMap requiere MAPPING y representación dual tipada para preservar hit NULL, default y componente numérico",
      expression.name,
      0,
    );
  if (name === "jsonobject")
    fail(
      "JSON_OBJECT_NULL_SEMANTICS_REQUIRES_TYPED_LOWERING",
      "JsonObject omite pares cuyo valor Qlik es NULL; JSON_OBJECT de BigQuery produciría JSON null",
      expression.name,
      0,
    );
  if (name === "jsonsetex")
    fail(
      "JSON_SET_EX_REQUIRES_TYPED_LOWERING",
      "JsonSetEx codifica valores Qlik y tiene semántica NULL distinta de JSON_SET",
      expression.name,
      0,
    );
  if (name === "jsonarray")
    fail(
      "JSON_ARRAY_REQUIRES_AGGREGATE_LOWERING",
      "JsonArray de Qlik es una agregación con DISTINCT/TOTAL/sort_weight, no un constructor escalar",
      expression.name,
      0,
    );
  if (["mode", "firstsortedvalue"].includes(name))
    fail(
      "AGGREGATION_REQUIRES_RELATIONAL_LOWERING",
      `${expression.name} requiere lowering relacional para preservar orden/empates y semántica Qlik`,
      expression.name,
      0,
    );
  if (registered.runtimeStatus !== "implemented")
    fail(
      "FUNCTION_NOT_RUNTIME_IMPLEMENTED",
      `${expression.name} está rastreada (${registered.strategy}) pero aún no implementada en runtime`,
      expression.name,
      0,
    );

  if (["upper", "lower", "trim", "ltrim", "rtrim"].includes(name)) {
    arity(expression.name, args, 1);
    const fn = name === "ltrim" ? "LTRIM" : name === "rtrim" ? "RTRIM" : name.toUpperCase();
    return `${fn}(${emitValue(args[0]!, environment)})`;
  }
  if (name === "len") {
    arity(expression.name, args, 1);
    return `LENGTH(${emitValue(args[0]!, environment)})`;
  }
  if (name === "left" || name === "right") {
    arity(expression.name, args, 2);
    return `${name.toUpperCase()}(${emitValue(args[0]!, environment)}, ${emitValue(args[1]!, environment)})`;
  }
  if (name === "replace") {
    arity(expression.name, args, 3);
    return `REPLACE(${args.map((arg) => emitValue(arg, environment)).join(", ")})`;
  }
  if (name === "mid") return emitMid(expression.name, args, environment);
  if (name === "chr") {
    arity(expression.name, args, 1);
    return `CHR(CAST(${emitValue(args[0]!, environment)} AS INT64))`;
  }
  if (name === "ord") {
    arity(expression.name, args, 1);
    const value = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
    return `TO_CODE_POINTS(${value})[SAFE_OFFSET(0)]`;
  }
  if (name === "repeat") {
    arity(expression.name, args, 2);
    return `REPEAT(CAST(${emitValue(args[0]!, environment)} AS STRING), CAST(${emitValue(args[1]!, environment)} AS INT64))`;
  }
  if (name === "keepchar" || name === "purgechar")
    return emitCharFilter(name, expression.name, args, environment);
  if (name === "index") return emitIndex(expression.name, args, environment);
  if (name === "findoneof")
    return emitFindOneOf(expression.name, args, environment);
  if (name === "capitalize") {
    arity(expression.name, args, 1);
    return `INITCAP(CAST(${emitValue(args[0]!, environment)} AS STRING))`;
  }
  if (name === "levenshteindist") {
    arity(expression.name, args, 2);
    return `EDIT_DISTANCE(CAST(${emitValue(args[0]!, environment)} AS STRING), CAST(${emitValue(args[1]!, environment)} AS STRING))`;
  }
  if (name === "isjson") return emitIsJson(expression.name, args, environment);
  if (name === "jsonget") return emitJsonGet(expression.name, args, environment);
  if (name === "jsonset") return emitJsonSet(expression.name, args, environment);
  if (name === "textbetween")
    return emitTextBetween(expression.name, args, environment);
  if (name === "substringcount")
    return emitSubStringCount(expression.name, args, environment);
  if (name === "countregex" || name === "countregexi")
    return emitCountRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "extractregex" || name === "extractregexi")
    return emitExtractRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "indexregex" || name === "indexregexi")
    return emitIndexRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "matchregex" || name === "matchregexi")
    return emitMatchRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "replaceregex" || name === "replaceregexi")
    return emitReplaceRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "extractregexgroup" || name === "extractregexgroupi")
    return emitExtractRegExGroup(name.endsWith("i"), expression.name, args, environment);
  if (name === "indexregexgroup" || name === "indexregexgroupi")
    return emitIndexRegExGroup(name.endsWith("i"), expression.name, args, environment);
  if (name === "subfieldregex" || name === "subfieldregexi")
    return emitSubFieldRegEx(name.endsWith("i"), expression.name, args, environment);
  if (name === "replaceregexgroup" || name === "replaceregexgroupi")
    return emitReplaceRegExGroup(name.endsWith("i"), expression.name, args, environment);
  if (name === "isregex" || name === "isregexi")
    return emitIsRegEx(expression.name, args);
  if (name === "subfield") return emitSubField(expression.name, args, environment);
  if (["e", "pi", "rand"].includes(name)) {
    arity(expression.name, args, 0);
    if (name === "e") return "EXP(1)";
    if (name === "pi") return "ACOS(-1)";
    return "RAND()";
  }
  if (["exp", "log", "log10", "sqr", "sqrt"].includes(name)) {
    arity(expression.name, args, 1);
    const value = emitNumericArgument(args[0]!, environment);
    if (name === "log") return `LN(${value})`;
    if (name === "sqr") return `POW(${value}, 2)`;
    return `${name.toUpperCase()}(${value})`;
  }
  if (name === "pow") {
    arity(expression.name, args, 2);
    return `POW(${emitNumericArgument(args[0]!, environment)}, ${emitNumericArgument(args[1]!, environment)})`;
  }
  if ([
    "acos", "acosh", "asin", "asinh", "atan", "atanh",
    "cos", "cosh", "sin", "sinh", "tan", "tanh",
  ].includes(name)) {
    arity(expression.name, args, 1);
    return `${name.toUpperCase()}(${emitNumericArgument(args[0]!, environment)})`;
  }
  if (name === "atan2") {
    arity(expression.name, args, 2);
    return `ATAN2(${emitNumericArgument(args[0]!, environment)}, ${emitNumericArgument(args[1]!, environment)})`;
  }
  if (name === "fabs") {
    arity(expression.name, args, 1);
    return `ABS(${emitValue(args[0]!, environment)})`;
  }
  if (name === "div") return emitDiv(expression.name, args, environment);
  if (name === "mod") return emitMod(expression.name, args, environment);
  if (name === "fmod") return emitFmod(expression.name, args, environment);
  if (name === "frac") return emitFrac(expression.name, args, environment);
  if (name === "even" || name === "odd")
    return emitParity(name, expression.name, args, environment);
  if (name === "bitcount")
    return emitBitCount(expression.name, args, environment);
  if (name === "sign") {
    arity(expression.name, args, 1);
    return `SIGN(${emitNumericArgument(args[0]!, environment)})`;
  }
  if (["year", "day"].includes(name)) {
    arity(expression.name, args, 1);
    const date = qlikDateFromAny(emitValue(args[0]!, environment));
    return `EXTRACT(${name.toUpperCase()} FROM ${date})`;
  }
  if (name === "week" || name === "weekyear")
    return emitWeekPart(name, expression.name, args, environment);
  if (["hour", "minute", "second"].includes(name)) {
    arity(expression.name, args, 1);
    return `EXTRACT(${name.toUpperCase()} FROM ${qlikTimestampFromAny(emitValue(args[0]!, environment))})`;
  }
  if (name === "quarter")
    return emitQuarter(expression.name, args, environment);
  if (name === "weekday")
    return emitWeekDay(expression.name, args, environment);
  if (name === "maketime")
    return emitMakeTime(expression.name, args, environment);
  if (name === "date") return emitDate(expression.name, args, environment);
  if (name === "month") return emitMonth(expression.name, args, environment);
  if (name === "monthstart") return emitMonthStart(expression.name, args, environment);
  if (["daystart", "dayend"].includes(name))
    return emitDayBoundary(name, expression.name, args, environment);
  if (["monthend", "quarterstart", "quarterend", "yearstart", "yearend"].includes(name))
    return emitPeriodBoundary(name, expression.name, args, environment);
  if (["makedate", "addyears", "addmonths"].includes(name)) {
    const date = emitDualDateRaw(name, expression.name, args, environment);
    return formatDualDate(date, environment, expression.name);
  }
  if (name === "num") return emitNum(expression.name, args, environment);
  if (name === "isnull") {
    arity(expression.name, args, 1);
    return `CASE WHEN ${emitValue(args[0]!, environment)} IS NULL THEN -1 ELSE 0 END`;
  }
  if (name === "emptyisnull") {
    arity(expression.name, args, 1);
    const value = emitValue(args[0]!, environment);
    return `CASE WHEN CAST(${value} AS STRING) = '' THEN NULL ELSE ${value} END`;
  }
  if (name === "null") {
    arity(expression.name, args, 0);
    return "NULL";
  }
  if (name === "if") {
    arityRange(expression.name, args, 2, 3);
    const otherwise = args[2] ? emitValue(args[2], environment) : "NULL";
    return `CASE WHEN ${emitCondition(args[0]!, environment)} THEN ${emitValue(args[1]!, environment)} ELSE ${otherwise} END`;
  }
  if (name === "match") return emitMatch(expression.name, args, environment);
  if (["round", "floor", "ceil"].includes(name))
    return emitRounding(name, expression.name, args, environment);
  if (["sum", "min", "max", "avg", "count"].includes(name))
    return emitBasicAggregation(name, expression, environment);
  if (name === "only")
    return emitOnly(expression, environment);
  if (["nullcount", "numericcount", "textcount", "missingcount"].includes(name))
    return emitCounterAggregation(name, expression, environment);
  if (["rangesum", "rangeavg", "rangemin", "rangemax"].includes(name))
    return emitBasicRange(name, expression.name, args, environment);
  if ([
    "rangecount", "rangenullcount", "rangenumericcount",
    "rangetextcount", "rangemissingcount",
  ].includes(name))
    return emitRangeCounter(name, expression.name, args, environment);
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} figura como implementada pero no tiene lowering`,
    expression.name,
    0,
  );
}

function emitBasicAggregation(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL depende del ámbito Qlik y no se puede eliminar silenciosamente`,
      expression.name,
      0,
    );
  arity(expression.name, expression.args, 1);
  const argument = expression.args[0]!;
  const distinct = modifiers.has("distinct") ? "DISTINCT " : "";
  if (argument.kind === "wildcard") {
    if (name !== "count" || distinct)
      fail(
        "AGGREGATION_WILDCARD_INVALID",
        `${expression.name}(*) solo es válido como Count(*) sin DISTINCT`,
        expression.name,
        0,
      );
    return "COUNT(*)";
  }
  return `${name.toUpperCase()}(${distinct}${emitValue(argument, environment)})`;
}

function emitOnly(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  arity(expression.name, expression.args, 1);
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL depende del ámbito Qlik y requiere lowering relacional`,
      expression.name,
      0,
    );
  const argument = expression.args[0]!;
  if (argument.kind === "wildcard")
    fail(
      "AGGREGATION_WILDCARD_INVALID",
      `${expression.name}(*) no es válido`,
      expression.name,
      0,
    );
  const value = emitValue(argument, environment);
  return `CASE WHEN COUNT(*) = COUNT(${value}) AND COUNT(DISTINCT ${value}) = 1 THEN ANY_VALUE(${value}) ELSE NULL END`;
}

function emitCounterAggregation(
  name: string,
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  arity(expression.name, expression.args, 1);
  const modifiers = new Set(expression.modifiers ?? []);
  if (modifiers.has("total"))
    fail(
      "AGGREGATION_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${expression.name} TOTAL requiere el ámbito Qlik explícito`,
      expression.name,
      0,
    );
  if (modifiers.has("distinct"))
    fail(
      "AGGREGATION_DISTINCT_REQUIRES_TYPED_LOWERING",
      `${expression.name}(DISTINCT ...) requiere deduplicar usando el tipo/dual Qlik original`,
      expression.name,
      0,
    );
  const argument = expression.args[0]!;
  const value = emitValue(argument, environment);
  const numeric = emitNumericArgument(argument, environment);
  if (name === "nullcount") return `COUNTIF(${value} IS NULL)`;
  if (name === "numericcount") return `COUNTIF(${numeric} IS NOT NULL)`;
  if (name === "textcount")
    return `COUNTIF(${value} IS NOT NULL AND ${numeric} IS NULL)`;
  return `COUNTIF(${numeric} IS NULL)`;
}

function emitBasicRange(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 1)
    fail("FUNCTION_ARITY", `${originalName} requiere al menos un argumento`, originalName, 0);
  const numeric = args.map((arg) => emitNumericArgument(arg, environment));
  if (name === "rangesum")
    return numeric.map((value) => `COALESCE(${value}, 0)`).join(" + ");
  const fn = name === "rangeavg" ? "AVG" : name === "rangemin" ? "MIN" : "MAX";
  return `(SELECT ${fn}(value) FROM UNNEST([${numeric.join(", ")}]) AS value WHERE value IS NOT NULL)`;
}

function emitRangeCounter(
  name: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 1)
    fail("FUNCTION_ARITY", `${originalName} requiere al menos un argumento`, originalName, 0);
  const parts = args.map((arg) => {
    const value = emitValue(arg, environment);
    const numeric = emitNumericArgument(arg, environment);
    if (name === "rangecount") return `CASE WHEN ${value} IS NULL THEN 0 ELSE 1 END`;
    if (name === "rangenullcount") return `CASE WHEN ${value} IS NULL THEN 1 ELSE 0 END`;
    if (name === "rangenumericcount") return `CASE WHEN ${numeric} IS NOT NULL THEN 1 ELSE 0 END`;
    if (name === "rangetextcount")
      return `CASE WHEN ${value} IS NOT NULL AND ${numeric} IS NULL THEN 1 ELSE 0 END`;
    return `CASE WHEN ${numeric} IS NULL THEN 1 ELSE 0 END`;
  });
  return parts.join(" + ");
}

function emitMid(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const start = `CAST(${emitValue(args[1]!, environment)} AS INT64)`;
  if (!args[2]) return `SUBSTR(${text}, ${start})`;
  const count = `CAST(${emitValue(args[2], environment)} AS INT64)`;
  return `SUBSTR(${text}, ${start}, ${count})`;
}

function emitCharFilter(
  kind: "keepchar" | "purgechar",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const source = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const chars = `TO_CODE_POINTS(CAST(${emitValue(args[1]!, environment)} AS STRING))`;
  const predicate = kind === "keepchar" ? "IN" : "NOT IN";
  return `CASE WHEN ${source} IS NULL THEN NULL ELSE COALESCE((SELECT CODE_POINTS_TO_STRING(ARRAY_AGG(cp ORDER BY pos)) FROM UNNEST(TO_CODE_POINTS(${source})) AS cp WITH OFFSET AS pos WHERE cp ${predicate} UNNEST(${chars})), '') END`;
}

function emitIndex(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const substring = `CAST(${emitValue(args[1]!, environment)} AS STRING)`;
  const count = args[2]
    ? `CAST(${emitValue(args[2], environment)} AS INT64)`
    : "1";
  return `CASE WHEN ${count} IS NULL THEN NULL WHEN ${count} = 0 THEN 0 WHEN ${count} > 0 THEN INSTR(${text}, ${substring}, 1, ${count}) ELSE INSTR(${text}, ${substring}, -1, ABS(${count})) END`;
}

function emitFindOneOf(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const charSet = `CAST(${emitValue(args[1]!, environment)} AS STRING)`;
  const count = args[2]
    ? `CAST(${emitValue(args[2], environment)} AS INT64)`
    : "1";
  const positions = `ARRAY(SELECT pos FROM UNNEST(GENERATE_ARRAY(1, LENGTH(${text}))) AS pos WHERE TO_CODE_POINTS(SUBSTR(${text}, pos, 1))[SAFE_OFFSET(0)] IN UNNEST(TO_CODE_POINTS(${charSet})) ORDER BY pos)`;
  return `CASE WHEN ${text} IS NULL OR ${charSet} IS NULL THEN NULL WHEN ${count} <= 0 THEN 0 ELSE COALESCE(${positions}[SAFE_ORDINAL(${count})], 0) END`;
}

function emitJsonSet(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  return `TO_JSON_STRING(${emitJsonSetRaw(originalName, args, environment)})`;
}

function emitJsonSetRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 3);
  const tokens = jsonPointerLiteral(args[1]!, originalName);
  const sourceText = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const valueText = `CAST(${emitValue(args[2]!, environment)} AS STRING)`;
  const root = `SAFE.PARSE_JSON(${sourceText})`;
  const value = `SAFE.PARSE_JSON(${valueText})`;
  const sourceInvalid = `(${root} IS NULL AND LOWER(TRIM(${sourceText})) != 'null')`;
  const valueInvalid = `(${value} IS NULL AND LOWER(TRIM(${valueText})) != 'null')`;

  if (tokens.length === 0)
    return `CASE WHEN ${sourceInvalid} OR ${valueInvalid} THEN NULL ELSE ${value} END`;

  const numeric = tokens.map((token) => /^(?:0|[1-9]\\d*)$/.test(token));
  if (numeric.some(Boolean) && tokens.length > 1)
    fail(
      "JSON_SET_MIXED_POINTER_REQUIRES_TYPED_LOWERING",
      `${originalName} requiere resolver contenedores array/objeto intermedios para RFC 6901`,
      originalName,
      0,
    );

  if (tokens.length === 1 && numeric[0]) {
    const token = tokens[0]!;
    const arrayPath = quoteString(`$[${token}]`);
    const objectPath = quoteString(`$."${escapeJsonPathKey(token)}"`);
    return `CASE WHEN ${valueInvalid} THEN NULL WHEN JSON_TYPE(${root}) = 'array' THEN JSON_SET(${root}, ${arrayPath}, ${value}) WHEN JSON_TYPE(${root}) = 'object' THEN JSON_SET(${root}, ${objectPath}, ${value}) ELSE NULL END`;
  }

  const fullPath = `$${tokens.map((token) => `."${escapeJsonPathKey(token)}"`).join("")}`;
  const compatibility: string[] = [`JSON_TYPE(${root}) = 'object'`];
  for (let index = 1; index < tokens.length; index += 1) {
    const parentPath = `$${tokens.slice(0, index).map((token) => `."${escapeJsonPathKey(token)}"`).join("")}`;
    const parent = `JSON_QUERY(${root}, ${quoteString(parentPath)})`;
    compatibility.push(`(${parent} IS NULL OR JSON_TYPE(${parent}) = 'object')`);
  }
  return `CASE WHEN ${valueInvalid} THEN NULL WHEN ${compatibility.join(" AND ")} THEN JSON_SET(${root}, ${quoteString(fullPath)}, ${value}) ELSE NULL END`;
}

function emitJsonGet(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const json = emitJsonGetRaw(originalName, args, environment);
  return `COALESCE(LAX_STRING(${json}), NULLIF(TO_JSON_STRING(${json}), 'null'))`;
}

function emitJsonGetRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const pointer = jsonPointerLiteral(args[1]!, originalName);
  let current = `SAFE.PARSE_JSON(CAST(${emitValue(args[0]!, environment)} AS STRING))`;
  let pendingObjectPath = "$";
  const flushObjectPath = () => {
    if (pendingObjectPath === "$") return;
    current = `JSON_QUERY(${current}, ${quoteString(pendingObjectPath)})`;
    pendingObjectPath = "$";
  };
  for (const token of pointer) {
    if (!/^(?:0|[1-9]\d*)$/.test(token)) {
      pendingObjectPath += `."${escapeJsonPathKey(token)}"`;
      continue;
    }
    flushObjectPath();
    const objectPath = quoteString(`$."${escapeJsonPathKey(token)}"`);
    const arrayPath = quoteString(`$[${token}]`);
    current = `CASE WHEN JSON_TYPE(${current}) = 'array' THEN JSON_QUERY(${current}, ${arrayPath}) ELSE JSON_QUERY(${current}, ${objectPath}) END`;
  }
  flushObjectPath();
  return current;
}

function jsonPointerLiteral(expression: ExprQlik, originalName: string): string[] {
  if (expression.kind !== "string")
    fail(
      "JSON_POINTER_DYNAMIC_REQUIRES_UDF",
      `${originalName} requiere RFC 6901 dinámico; el lowering limpio solo admite path literal`,
      originalName,
      0,
    );
  const pointer = expression.value;
  if (pointer === "") return [];
  if (!pointer.startsWith("/"))
    fail("JSON_POINTER_INVALID", `${originalName} requiere un JSON Pointer RFC 6901 válido`, originalName, 0);
  return pointer.slice(1).split("/").map((token) => {
    let decoded = "";
    for (let i = 0; i < token.length; i += 1) {
      const char = token[i] ?? "";
      if (char !== "~") { decoded += char; continue; }
      const escape = token[i + 1];
      if (escape === "0") decoded += "~";
      else if (escape === "1") decoded += "/";
      else fail("JSON_POINTER_INVALID", `${originalName} contiene escape RFC 6901 inválido`, originalName, 0);
      i += 1;
    }
    return decoded;
  });
}

function escapeJsonPathKey(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function emitIsJson(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const source = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const parsed = `SAFE.PARSE_JSON(${source})`;
  if (!args[1])
    return `CASE WHEN ${parsed} IS NULL AND LOWER(TRIM(${source})) != 'null' THEN 0 ELSE -1 END`;
  const type = literalString(args[1], originalName).toLowerCase();
  if (!new Set(["value", "object", "array", "string", "number", "boolean", "null"]).has(type))
    return "0";
  if (type === "value")
    return `CASE WHEN ${parsed} IS NULL AND LOWER(TRIM(${source})) != 'null' THEN 0 ELSE -1 END`;
  return `CASE WHEN JSON_TYPE(${parsed}) = ${quoteString(type)} THEN -1 ELSE 0 END`;
}

function emitTextBetween(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const before = `CAST(${emitValue(args[1]!, environment)} AS STRING)`;
  const after = `CAST(${emitValue(args[2]!, environment)} AS STRING)`;
  const occurrence = args[3]
    ? `CAST(${emitValue(args[3], environment)} AS INT64)`
    : "1";
  const start = `INSTR(${text}, ${before}, 1, ${occurrence})`;
  const contentStart = `(${start} + LENGTH(${before}))`;
  const finish = `INSTR(${text}, ${after}, ${contentStart}, 1)`;
  return `CASE WHEN ${occurrence} IS NULL OR ${occurrence} <= 0 OR ${start} = 0 OR ${finish} = 0 THEN NULL ELSE SUBSTR(${text}, ${contentStart}, ${finish} - ${contentStart}) END`;
}

function emitSubStringCount(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const substring = `CAST(${emitValue(args[1]!, environment)} AS STRING)`;
  const lastStart = `LENGTH(${text}) - LENGTH(${substring}) + 1`;
  return `CASE WHEN ${text} IS NULL OR ${substring} IS NULL THEN NULL WHEN LENGTH(${substring}) = 0 THEN 0 ELSE (SELECT COUNTIF(SUBSTR(${text}, pos, LENGTH(${substring})) = ${substring}) FROM UNNEST(GENERATE_ARRAY(1, GREATEST(0, ${lastStart}))) AS pos) END`;
}

function emitCountRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(args[1]!, originalName, insensitive),
  );
  return `CASE WHEN ${text} IS NULL THEN NULL ELSE ARRAY_LENGTH(REGEXP_EXTRACT_ALL(${text}, ${pattern})) END`;
}

function emitExtractRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length === 2)
    fail(
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande registros dentro de LOAD`,
      originalName,
      0,
    );
  arity(originalName, args, 3);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(args[1]!, originalName, insensitive),
  );
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const fieldNo = `CAST(TRUNC(${emitNumericValue(args[2]!, environment)}) AS INT64)`;
  return `CASE WHEN ${text} IS NULL OR ${fieldNo} IS NULL THEN NULL WHEN ${fieldNo} > 0 THEN ${matches}[SAFE_ORDINAL(${fieldNo})] WHEN ${fieldNo} < 0 THEN ${matches}[SAFE_ORDINAL(ARRAY_LENGTH(${matches}) + ${fieldNo} + 1)] ELSE NULL END`;
}

function emitIndexRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(args[1]!, originalName, insensitive),
  );
  const count = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "1";
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const fromRight = `ARRAY_LENGTH(${matches}) + ${count} + 1`;
  return `CASE WHEN ${text} IS NULL OR ${count} IS NULL THEN NULL WHEN ${count} > 0 THEN REGEXP_INSTR(${text}, ${pattern}, 1, ${count}) WHEN ${count} < 0 AND ${fromRight} > 0 THEN REGEXP_INSTR(${text}, ${pattern}, 1, ${fromRight}) ELSE 0 END`;
}

function emitMatchRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 2)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos 2 argumentos y recibió ${args.length}`,
      originalName,
      0,
    );
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const branches = args.slice(1).map((arg, index) => {
    const regex = prepararRegexQlik(arg, originalName, insensitive);
    const exact = quoteString(`^(?:${regex})$`);
    return `WHEN REGEXP_CONTAINS(${text}, ${exact}) THEN ${index + 1}`;
  });
  return `CASE ${branches.join(" ")} ELSE 0 END`;
}

function prepararRegexQlik(
  expression: ExprQlik,
  originalName: string,
  insensitive: boolean,
): string {
  const perl = literalString(expression, originalName);
  validarRegexPerlCompatibleConRe2(perl, originalName);
  const re2 = convertirCapturasANoCapturantes(perl);
  return insensitive ? `(?i:${re2})` : re2;
}

function validarRegexPerlCompatibleConRe2(
  pattern: string,
  originalName: string,
): void {
  let escaped = false;
  let characterClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const current = pattern[i] ?? "";
    const next = pattern[i + 1] ?? "";
    if (escaped) {
      if (/^[1-9gkKRCXhHvV]$/.test(current))
        regexPerlUdf(originalName, pattern);
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "[" && !characterClass) {
      characterClass = true;
      continue;
    }
    if (current === "]" && characterClass) {
      characterClass = false;
      continue;
    }
    if (characterClass || current !== "(") continue;
    if (next === "*") regexPerlUdf(originalName, pattern);
    if (next !== "?") continue;
    const tail = pattern.slice(i);
    if (/^\(\?:/.test(tail)) continue;
    if (/^\(\?[imsU-]+(?::|\))/.test(tail)) continue;
    regexPerlUdf(originalName, pattern);
  }
  if (/(?:\*|\+|\?|\{\d+(?:,\d*)?\})\+/.test(pattern))
    regexPerlUdf(originalName, pattern);
}

function regexPerlUdf(originalName: string, pattern: string): never {
  fail(
    "REGEX_PERL_FEATURE_REQUIRES_UDF",
    `${originalName} usa sintaxis Perl regex que RE2 de BigQuery no representa de forma segura: ${pattern}`,
    originalName,
    0,
  );
}

function convertirCapturasANoCapturantes(pattern: string): string {
  let output = "";
  let escaped = false;
  let characterClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const current = pattern[i] ?? "";
    if (escaped) {
      output += current;
      escaped = false;
      continue;
    }
    if (current === "\\") {
      output += current;
      escaped = true;
      continue;
    }
    if (current === "[" && !characterClass) characterClass = true;
    else if (current === "]" && characterClass) characterClass = false;
    if (!characterClass && current === "(" && pattern[i + 1] !== "?") {
      output += "(?:";
      continue;
    }
    output += current;
  }
  return output;
}

function emitReplaceRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const pattern = quoteString(prepararRegexQlik(args[1]!, originalName, insensitive));
  const replacement = emitRegexReplacement(args[2]!, environment);
  if (!args[3] || (args[3].kind === "number" && Number(args[3].raw) === 0))
    return `REGEXP_REPLACE(${text}, ${pattern}, ${replacement})`;

  if (args[3].kind === "number" && /^[+-]?\d+$/.test(args[3].raw)) {
    const literal = Number(args[3].raw);
    const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
    const target = literal > 0
      ? String(literal)
      : `ARRAY_LENGTH(${matches}) - ${Math.abs(literal)} + 1`;
    const start = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 0)`;
    const finish = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 1)`;
    return `CASE WHEN ${target} <= 0 OR ${start} = 0 THEN ${text} ELSE CONCAT(SUBSTR(${text}, 1, ${start} - 1), ${replacement}, SUBSTR(${text}, ${finish})) END`;
  }

  const occurrence = `CAST(TRUNC(${emitNumericValue(args[3], environment)}) AS INT64)`;
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const target = `CASE WHEN ${occurrence} > 0 THEN ${occurrence} WHEN ${occurrence} < 0 THEN ARRAY_LENGTH(${matches}) + ${occurrence} + 1 ELSE 0 END`;
  const start = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 0)`;
  const finish = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 1)`;
  return `CASE WHEN ${text} IS NULL OR ${occurrence} IS NULL THEN NULL WHEN ${occurrence} = 0 THEN REGEXP_REPLACE(${text}, ${pattern}, ${replacement}) WHEN ${target} <= 0 OR ${start} = 0 THEN ${text} ELSE CONCAT(SUBSTR(${text}, 1, ${start} - 1), ${replacement}, SUBSTR(${text}, ${finish})) END`;
}

function emitRegexReplacement(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "string")
    return `CAST(${quoteString(expression.value.replace(/\\/g, "\\\\"))} AS STRING)`;
  const value = `CAST(${emitValue(expression, environment)} AS STRING)`;
  return `REPLACE(${value}, ${quoteString("\\")}, ${quoteString("\\\\")})`;
}

function emitExtractRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  if (args.length === 3)
    fail(
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande registros dentro de LOAD`,
      originalName,
      0,
    );
  const group = literalInteger(args[2]!, originalName);
  if (group < 0)
    fail("REGEX_NEGATIVE_GROUP_REQUIRES_UDF", `${originalName} con group negativo requiere semántica Perl/Qlik exacta`, originalName, 0);
  const rewritten = prepararRegexGrupoQlik(args[1]!, originalName, insensitive, group);
  if (!rewritten.exists) return "NULL";
  const text = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const fieldNo = args[3]
    ? `CAST(TRUNC(${emitNumericValue(args[3], environment)}) AS INT64)`
    : "1";
  if (args[3]?.kind === "number" && Number(args[3].raw) < 0) {
    const all = `REGEXP_EXTRACT_ALL(${text}, ${quoteString(rewritten.pattern)})`;
    return `${all}[SAFE_ORDINAL(ARRAY_LENGTH(${all}) + ${fieldNo} + 1)]`;
  }
  if (args[3] && args[3].kind !== "number")
    fail("REGEX_DYNAMIC_NEGATIVE_OCCURRENCE_REQUIRES_UDF", `${originalName} requiere distinguir occurrence positivo/negativo en runtime`, originalName, 0);
  return `REGEXP_EXTRACT(${text}, ${quoteString(rewritten.pattern)}, 1, ${fieldNo})`;
}

function emitIndexRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const group = literalInteger(args[2]!, originalName);
  if (group !== 0)
    fail("REGEX_GROUP_POSITION_REQUIRES_UDF", `${originalName} para grupos internos necesita la posición exacta del grupo, no solo del match completo`, originalName, 0);
  const delegated = args[3] ? [args[0]!, args[1]!, args[3]] : [args[0]!, args[1]!];
  return emitIndexRegEx(insensitive, originalName, delegated, environment);
}

function emitReplaceRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 4, 5);
  const group = literalInteger(args[3]!, originalName);
  if (group === 0) {
    const delegated = args[4]
      ? [args[0]!, args[1]!, args[2]!, args[4]]
      : [args[0]!, args[1]!, args[2]!];
    return emitReplaceRegEx(insensitive, originalName, delegated, environment);
  }
  prepararRegexQlik(args[1]!, originalName, insensitive);
  fail(
    "REGEX_GROUP_REPLACEMENT_REQUIRES_UDF",
    `${originalName} requiere reemplazar un grupo interno sin alterar el resto del match; GoogleSQL no expone esa posición de forma exacta`,
    originalName,
    0,
  );
}

function emitIsRegEx(originalName: string, args: ExprQlik[]): never {
  arityRange(originalName, args, 1, 2);
  fail(
    "REGEX_VALIDATION_REQUIRES_UDF",
    `${originalName} valida sintaxis Perl/Qlik; validar solo RE2 produciría falsos negativos`,
    originalName,
    0,
  );
}

function emitSubFieldRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  _environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  prepararRegexQlik(args[1]!, originalName, insensitive);
  if (!args[2])
    fail("REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING", `${originalName} sin field_no expande filas dentro de LOAD`, originalName, 0);
  fail("REGEX_SPLIT_REQUIRES_UDF", `${originalName} requiere split regex exacto; GoogleSQL no expone REGEXP_SPLIT`, originalName, 0);
}

function prepararRegexGrupoQlik(
  expression: ExprQlik,
  originalName: string,
  insensitive: boolean,
  targetGroup: number,
): { pattern: string; exists: boolean } {
  const perl = literalString(expression, originalName);
  validarRegexPerlCompatibleConRe2(perl, originalName);
  let output = "";
  let escaped = false;
  let characterClass = false;
  let capture = 0;
  for (let i = 0; i < perl.length; i += 1) {
    const current = perl[i] ?? "";
    if (escaped) { output += current; escaped = false; continue; }
    if (current === "\\") { output += current; escaped = true; continue; }
    if (current === "[" && !characterClass) characterClass = true;
    else if (current === "]" && characterClass) characterClass = false;
    if (!characterClass && current === "(" && perl[i + 1] !== "?") {
      capture += 1;
      output += targetGroup === capture ? "(" : "(?:";
      continue;
    }
    output += current;
  }
  if (targetGroup === 0) output = convertirCapturasANoCapturantes(perl);
  const exists = targetGroup === 0 || targetGroup <= capture;
  return { pattern: insensitive ? `(?i:${output})` : output, exists };
}

function emitMatch(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 2)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos 2 argumentos y recibió ${args.length}`,
      originalName,
      0,
    );
  const target = `CAST(${emitValue(args[0]!, environment)} AS STRING)`;
  const branches = args
    .slice(1)
    .map(
      (arg, index) =>
        `WHEN ${target} = CAST(${emitValue(arg, environment)} AS STRING) THEN ${index + 1}`,
    )
    .join(" ");
  return `CASE ${branches} ELSE 0 END`;
}

function emitSubField(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length === 2)
    fail(
      "SUBFIELD_EXPANDING_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande filas y debe compilarse como operación relacional`,
      originalName,
      0,
    );
  arity(originalName, args, 3);
  const text = `COALESCE(CAST(${emitValue(args[0]!, environment)} AS STRING), '')`;
  const delimiter = `CAST(${emitValue(args[1]!, environment)} AS STRING)`;
  const fieldNo = `CAST(${emitValue(args[2]!, environment)} AS INT64)`;
  const parts = `SPLIT(${text}, ${delimiter})`;
  return `CASE WHEN ${fieldNo} > 0 THEN ${parts}[SAFE_ORDINAL(${fieldNo})] WHEN ${fieldNo} < 0 THEN ${parts}[SAFE_ORDINAL(ARRAY_LENGTH(${parts}) + ${fieldNo} + 1)] ELSE NULL END`;
}

function qlikNumeric(sql: string): string {
  return `SAFE_CAST(CAST(${sql} AS STRING) AS BIGNUMERIC)`;
}

function qlikNumericOrTemporal(sql: string): string {
  const numeric = qlikNumeric(sql);
  const timestamp = qlikTimestampFromAny(sql);
  return `COALESCE(${numeric}, ${qlikSerialFromTimestamp(timestamp)})`;
}

function qlikSerialFromTimestamp(timestamp: string): string {
  return `SAFE_DIVIDE(CAST(TIMESTAMP_DIFF(${timestamp}, TIMESTAMP '1899-12-30 00:00:00+00', MICROSECOND) AS BIGNUMERIC), 86400000000)`;
}

function emitDiv(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(args[0]!, environment);
  const right = emitNumericArgument(args[1]!, environment);
  return `CAST(TRUNC(SAFE_DIVIDE(${left}, ${right})) AS INT64)`;
}

function emitMod(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(args[0]!, environment);
  const right = emitNumericArgument(args[1]!, environment);
  return `CASE WHEN ${left} IS NULL OR ${right} IS NULL OR ${left} != TRUNC(${left}) OR ${right} != TRUNC(${right}) OR ${right} <= 0 THEN NULL ELSE CAST(${left} - ${right} * FLOOR(${left} / ${right}) AS INT64) END`;
}

function emitFmod(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const left = emitNumericArgument(args[0]!, environment);
  const right = emitNumericArgument(args[1]!, environment);
  const quotient = `SAFE_DIVIDE(${left}, ${right})`;
  return `CASE WHEN ${left} IS NULL OR ${right} IS NULL OR ${right} = 0 THEN NULL ELSE ${left} - ${right} * TRUNC(${quotient}) END`;
}

function emitFrac(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const value = emitNumericArgument(args[0]!, environment);
  return `CASE WHEN ${value} IS NULL THEN NULL ELSE ${value} - FLOOR(${value}) END`;
}

function emitParity(
  kind: "even" | "odd",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const value = emitNumericArgument(args[0]!, environment);
  const parity = kind === "even" ? "0" : "1";
  return `CASE WHEN ${value} IS NULL OR ${value} != TRUNC(${value}) THEN NULL WHEN ${value} = 0 THEN -1 WHEN MOD(ABS(CAST(${value} AS INT64)), 2) = ${parity} THEN -1 ELSE 0 END`;
}

function emitBitCount(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  const numeric = emitNumericArgument(args[0]!, environment);
  const integer = `SAFE_CAST(${numeric} AS INT64)`;
  return `CASE WHEN ${numeric} IS NULL OR ${numeric} != TRUNC(${numeric}) OR ${integer} IS NULL THEN NULL ELSE BIT_COUNT(${integer} & 4294967295) END`;
}

function emitMakeTimeRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const hour = `CAST(TRUNC(${emitNumericValue(args[0]!, environment)}) AS INT64)`;
  const minute = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const second = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "0";
  const encoded = `FORMAT('%02d:%02d:%02d', ${hour}, ${minute}, ${second})`;
  return `CASE WHEN ${hour} BETWEEN 0 AND 23 AND ${minute} BETWEEN 0 AND 59 AND ${second} BETWEEN 0 AND 59 THEN SAFE.PARSE_TIME('%H:%M:%S', ${encoded}) ELSE NULL END`;
}

function emitMakeTime(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const time = emitMakeTimeRaw(originalName, args, environment);
  const format = environment.timeFormat ?? fail(
    "TIME_FORMAT_ENV_REQUIRED",
    `${originalName} requiere TimeFormat para conservar el texto dual`,
    originalName,
    0,
  );
  return formatQlikTime(time, format, originalName);
}

function formatQlikTime(
  time: string,
  format: string,
  functionName: string,
): string {
  if (format === "hh:mm:ss") return `FORMAT_TIME('%H:%M:%S', ${time})`;
  if (format === "hh:mm") return `FORMAT_TIME('%H:%M', ${time})`;
  if (format === "hh:mm:ss TT") return `FORMAT_TIME('%I:%M:%S %p', ${time})`;
  if (format === "hh:mm TT") return `FORMAT_TIME('%I:%M %p', ${time})`;
  if (format === "h:mm:ss")
    return `FORMAT('%d:%02d:%02d', EXTRACT(HOUR FROM ${time}), EXTRACT(MINUTE FROM ${time}), CAST(FLOOR(EXTRACT(SECOND FROM ${time})) AS INT64))`;
  if (format === "h:mm:ss TT")
    return `FORMAT('%d:%02d:%02d %s', IF(MOD(EXTRACT(HOUR FROM ${time}), 12) = 0, 12, MOD(EXTRACT(HOUR FROM ${time}), 12)), EXTRACT(MINUTE FROM ${time}), CAST(FLOOR(EXTRACT(SECOND FROM ${time})) AS INT64), IF(EXTRACT(HOUR FROM ${time}) < 12, 'AM', 'PM'))`;
  fail(
    "QLIK_TIME_FORMAT_NOT_IMPLEMENTED",
    `${functionName} usa un TimeFormat Qlik aún no certificado: ${format}`,
    functionName,
    0,
  );
}

function formatDualDate(
  date: string,
  environment: EntornoExpresionQlik,
  functionName: string,
): string {
  const qlikFormat = environment.dateFormat ?? fail(
    "DATE_FORMAT_ENV_REQUIRED",
    `${functionName} requiere DateFormat para conservar el texto dual`,
    functionName,
    0,
  );
  return `FORMAT_DATE(${quoteString(translateQlikDateFormat(qlikFormat, functionName))}, ${date})`;
}

function emitDualDateRaw(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (kind === "makedate") {
    arityRange(originalName, args, 1, 3);
    const year = `CAST(TRUNC(${emitNumericValue(args[0]!, environment)}) AS INT64)`;
    const month = args[1]
      ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
      : "1";
    const day = args[2]
      ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
      : "1";
    return `SAFE.PARSE_DATE('%Y-%m-%d', FORMAT('%04d-%02d-%02d', ${year}, ${month}, ${day}))`;
  }
  if (kind === "addyears") {
    arity(originalName, args, 2);
    const date = qlikDateFromAny(emitValue(args[0]!, environment));
    const years = `CAST(TRUNC(${emitNumericValue(args[1]!, environment)}) AS INT64)`;
    return `DATE_ADD(${date}, INTERVAL ${years} YEAR)`;
  }
  if (kind === "addmonths") {
    arityRange(originalName, args, 2, 3);
    const date = qlikDateFromAny(emitValue(args[0]!, environment));
    const months = `CAST(TRUNC(${emitNumericValue(args[1]!, environment)}) AS INT64)`;
    const mode = args[2] ? emitNumericValue(args[2], environment) : "0";
    const normal = `DATE_ADD(${date}, INTERVAL ${months} MONTH)`;
    const targetMonth = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL ${months} MONTH)`;
    const relativeEnd = `DATE_SUB(LAST_DAY(${targetMonth}), INTERVAL DATE_DIFF(LAST_DAY(${date}), ${date}, DAY) DAY)`;
    return `CASE WHEN ${mode} = 1 AND EXTRACT(DAY FROM ${date}) >= 28 THEN ${relativeEnd} ELSE ${normal} END`;
  }
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${originalName} no tiene construcción de fecha dual`,
    originalName,
    0,
  );
}

function emitWeekPart(
  kind: "week" | "weekyear",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 4);
  const firstWeekDay = args[1]
    ? literalInteger(args[1], originalName)
    : environment.firstWeekDay;
  const brokenWeeks = args[2]
    ? literalInteger(args[2], originalName)
    : environment.brokenWeeks;
  const referenceDayRaw = args[3]
    ? literalInteger(args[3], originalName)
    : environment.referenceDay;
  if (
    firstWeekDay === undefined ||
    brokenWeeks === undefined ||
    referenceDayRaw === undefined
  )
    fail(
      "WEEK_ENV_REQUIRED",
      `${originalName} requiere FirstWeekDay, BrokenWeeks y ReferenceDay para preservar el calendario Qlik`,
      originalName,
      0,
    );
  if (firstWeekDay < 0 || firstWeekDay > 6 || ![0, 1].includes(brokenWeeks))
    fail(
      "WEEK_CONFIGURATION_INVALID",
      `${originalName} recibió FirstWeekDay/BrokenWeeks inválidos (${firstWeekDay},${brokenWeeks})`,
      originalName,
      0,
    );
  const referenceDay =
    referenceDayRaw >= 1 && referenceDayRaw <= 7 ? referenceDayRaw : 4;
  if (firstWeekDay !== 0 || brokenWeeks !== 0 || referenceDay !== 4)
    fail(
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
      `${originalName} usa calendario Qlik no-ISO (${firstWeekDay},${brokenWeeks},${referenceDayRaw})`,
      originalName,
      0,
    );
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  return `EXTRACT(${kind === "week" ? "ISOWEEK" : "ISOYEAR"} FROM ${date})`;
}

function literalInteger(expression: ExprQlik, functionName: string): number {
  if (expression.kind !== "number" || !/^[+-]?\d+$/.test(expression.raw))
    fail(
      "FUNCTION_LITERAL_INTEGER_REQUIRED",
      `${functionName} requiere un entero literal para esta configuración en esta fase`,
      functionName,
      0,
    );
  return Number(expression.raw);
}

function emitQuarter(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  if (!args[1]) return `EXTRACT(QUARTER FROM ${date})`;
  const firstMonth = `CAST(${emitValue(args[1], environment)} AS INT64)`;
  return `CASE WHEN ${firstMonth} BETWEEN 1 AND 12 THEN CAST(FLOOR(MOD(EXTRACT(MONTH FROM ${date}) - ${firstMonth} + 12, 12) / 3) + 1 AS INT64) ELSE NULL END`;
}

function emitDate(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const qlikFormat = args[1]
    ? literalString(args[1], originalName)
    : environment.dateFormat ?? fail("DATE_FORMAT_ENV_REQUIRED", `${originalName} requiere DateFormat o un formato explícito`, originalName, 0);
  const format = translateQlikDateFormat(qlikFormat, originalName);
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  return `FORMAT_DATE(${quoteString(format)}, ${date})`;
}

function weekDayParts(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): { actual: string; numeric: string } {
  arityRange(originalName, args, 1, 2);
  const firstWeekDay = args[1]
    ? literalInteger(args[1], originalName)
    : environment.firstWeekDay;
  if (firstWeekDay === undefined || firstWeekDay < 0 || firstWeekDay > 6)
    fail(
      "WEEKDAY_ENV_REQUIRED",
      `${originalName} requiere FirstWeekDay entre 0 y 6`,
      originalName,
      0,
    );
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  const actual = `MOD(EXTRACT(DAYOFWEEK FROM ${date}) + 5, 7)`;
  const numeric = `MOD(${actual} - ${firstWeekDay} + 7, 7)`;
  return { actual, numeric };
}

function emitWeekDay(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (!environment.dayNames || environment.dayNames.length !== 7)
    fail(
      "DAY_NAMES_ENV_REQUIRED",
      `${originalName} requiere DayNames con 7 valores para conservar el texto dual`,
      originalName,
      0,
    );
  const { actual } = weekDayParts(originalName, args, environment);
  const cases = environment.dayNames
    .map((value, index) => `WHEN ${index} THEN ${quoteString(value)}`)
    .join(" ");
  return `CASE ${actual} ${cases} END`;
}

function emitMonth(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 1);
  if (!environment.monthNames || environment.monthNames.length !== 12)
    fail("MONTH_NAMES_ENV_REQUIRED", `${originalName} requiere MonthNames con 12 valores para conservar el texto dual`, originalName, 0);
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  const cases = environment.monthNames
    .map((value, index) => `WHEN ${index + 1} THEN ${quoteString(value)}`)
    .join(" ");
  return `CASE EXTRACT(MONTH FROM ${date}) ${cases} END`;
}

function emitDayBoundary(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const timestamp = emitDayBoundaryTimestamp(kind, originalName, args, environment);
  const format = environment.timestampFormat ?? fail(
    "TIMESTAMP_FORMAT_ENV_REQUIRED",
    `${originalName} requiere TimestampFormat para conservar el texto dual`,
    originalName,
    0,
  );
  if (format === "YYYY-MM-DD hh:mm:ss")
    return `FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', ${timestamp}, 'UTC')`;
  if (format === "M/D/YYYY h:mm:ss[.fff] TT") {
    const millis = `EXTRACT(MILLISECOND FROM ${timestamp} AT TIME ZONE 'UTC')`;
    return `FORMAT('%d/%d/%04d %d:%02d:%02d%s %s', EXTRACT(MONTH FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(DAY FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(YEAR FROM ${timestamp} AT TIME ZONE 'UTC'), IF(MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12) = 0, 12, MOD(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC'), 12)), EXTRACT(MINUTE FROM ${timestamp} AT TIME ZONE 'UTC'), EXTRACT(SECOND FROM ${timestamp} AT TIME ZONE 'UTC'), IF(${millis} = 0, '', FORMAT('.%03d', ${millis})), IF(EXTRACT(HOUR FROM ${timestamp} AT TIME ZONE 'UTC') < 12, 'AM', 'PM'))`;
  }
  fail(
    "QLIK_TIMESTAMP_FORMAT_NOT_IMPLEMENTED",
    `${originalName} usa un TimestampFormat Qlik aún no certificado: ${format}`,
    originalName,
    0,
  );
}

function emitDayBoundaryTimestamp(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const timestamp = qlikTimestampFromAny(emitValue(args[0]!, environment));
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";
  const dayStart = args[2] ? emitNumericValue(args[2], environment) : "0";
  const offsetMicros = `CAST(ROUND((${dayStart}) * 86400000000) AS INT64)`;
  const shifted = `TIMESTAMP_SUB(${timestamp}, INTERVAL ${offsetMicros} MICROSECOND)`;
  const base = `TIMESTAMP_ADD(TIMESTAMP_TRUNC(${shifted}, DAY, 'UTC'), INTERVAL ${offsetMicros} MICROSECOND)`;
  const start = `TIMESTAMP_ADD(${base}, INTERVAL ${period} DAY)`;
  if (kind === "daystart") return start;
  return `TIMESTAMP_SUB(TIMESTAMP_ADD(${start}, INTERVAL 1 DAY), INTERVAL 1 MILLISECOND)`;
}

function emitPeriodBoundary(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const timestamp = emitPeriodBoundaryTimestamp(kind, originalName, args, environment);
  return formatDualDate(`DATE(${timestamp})`, environment, originalName);
}

function emitPeriodBoundaryTimestamp(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  const isMonth = kind === "monthend";
  arityRange(originalName, args, 1, isMonth ? 2 : 3);
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  const period = args[1]
    ? `CAST(TRUNC(${emitNumericValue(args[1], environment)}) AS INT64)`
    : "0";

  let start: string;
  let nextInterval: string;
  if (isMonth) {
    start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL ${period} MONTH)`;
    nextInterval = "INTERVAL 1 MONTH";
  } else {
    const firstMonth = args[2] ? literalInteger(args[2], originalName) : 1;
    if (firstMonth < 1 || firstMonth > 12)
      fail(
        "TEMPORAL_FIRST_MONTH_INVALID",
        `${originalName} requiere first_month_of_year entre 1 y 12`,
        originalName,
        0,
      );
    const shift = firstMonth - 1;
    const shifted = shift === 0 ? date : `DATE_SUB(${date}, INTERVAL ${shift} MONTH)`;
    const unit = kind.startsWith("quarter") ? "QUARTER" : "YEAR";
    const baseShifted = `DATE_TRUNC(${shifted}, ${unit})`;
    const base = shift === 0 ? baseShifted : `DATE_ADD(${baseShifted}, INTERVAL ${shift} MONTH)`;
    if (unit === "QUARTER") {
      start = `DATE_ADD(${base}, INTERVAL CAST((${period}) * 3 AS INT64) MONTH)`;
      nextInterval = "INTERVAL 3 MONTH";
    } else {
      start = `DATE_ADD(${base}, INTERVAL ${period} YEAR)`;
      nextInterval = "INTERVAL 1 YEAR";
    }
  }

  if (kind.endsWith("start")) return `TIMESTAMP(${start})`;
  return `TIMESTAMP_SUB(TIMESTAMP(DATE_ADD(${start}, ${nextInterval})), INTERVAL 1 MILLISECOND)`;
}

function emitMonthStart(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const qlikFormat = environment.dateFormat ?? fail(
    "DATE_FORMAT_ENV_REQUIRED",
    `${originalName} requiere DateFormat para conservar el texto dual`,
    originalName,
    0,
  );
  const format = translateQlikDateFormat(qlikFormat, originalName);
  const date = qlikDateFromAny(emitValue(args[0]!, environment));
  const period = args[1] ? emitValue(args[1], environment) : "0";
  const start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL CAST(${period} AS INT64) MONTH)`;
  return `FORMAT_DATE(${quoteString(format)}, ${start})`;
}

function emitNum(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 4);
  if (!args[1])
    fail("NUM_FORMAT_REQUIRED", `${originalName} sin formato explícito aún requiere el modelo completo de variables numéricas Qlik`, originalName, 0);
  const format = literalString(args[1], originalName);
  const bigQueryFormat = translateQlikNumberFormat(format, originalName);
  const number = emitNumericArgument(args[0]!, environment);
  let result = `CAST(${number} AS STRING FORMAT ${quoteString(bigQueryFormat)})`;
  const decimalSep = args[2] ? literalString(args[2], originalName) : environment.decimalSep ?? ".";
  const thousandSep = args[3] ? literalString(args[3], originalName) : environment.thousandSep ?? ",";
  if (decimalSep !== "." || thousandSep !== ",") {
    result = `REPLACE(REPLACE(REPLACE(${result}, ',', '{QLIK_THOUSAND}'), '.', ${quoteString(decimalSep)}), '{QLIK_THOUSAND}', ${quoteString(thousandSep)})`;
  }
  return result;
}

function emitRounding(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const x = emitValue(args[0]!, environment);
  if (args.length === 1 && kind === "floor") return `FLOOR(${x})`;
  if (args.length === 1 && kind === "ceil") return `CEIL(${x})`;
  const step = args[1] ? emitValue(args[1], environment) : "1";
  const offset = args[2] ? emitValue(args[2], environment) : "0";
  const normalized = `((${x}) - (${offset})) / (${step})`;
  if (kind === "round")
    return `(FLOOR(${normalized} + 0.5) * (${step}) + (${offset}))`;
  if (kind === "floor")
    return `(FLOOR(${normalized}) * (${step}) + (${offset}))`;
  return `(CEIL(${normalized}) * (${step}) + (${offset}))`;
}

function qlikDateFromAny(sql: string): string {
  const text = `CAST(${sql} AS STRING)`;
  const number = `SAFE_CAST(${text} AS FLOAT64)`;
  return `COALESCE(SAFE_CAST(${text} AS DATE), DATE(SAFE_CAST(${text} AS TIMESTAMP)), DATE_ADD(DATE '1899-12-30', INTERVAL CAST(FLOOR(${number}) AS INT64) DAY))`;
}

function qlikTimestampFromAny(sql: string): string {
  const text = `CAST(${sql} AS STRING)`;
  const number = `SAFE_CAST(${text} AS FLOAT64)`;
  const timeOnly = `TIMESTAMP(DATETIME(DATE '1899-12-30', SAFE_CAST(${text} AS TIME)), 'UTC')`;
  const serial = `TIMESTAMP_ADD(TIMESTAMP '1899-12-30 00:00:00+00', INTERVAL CAST(ROUND(${number} * 86400000000) AS INT64) MICROSECOND)`;
  return `COALESCE(SAFE_CAST(${text} AS TIMESTAMP), TIMESTAMP(SAFE_CAST(${text} AS DATE)), ${timeOnly}, ${serial})`;
}

function translateQlikDateFormat(format: string, functionName: string): string {
  const formats: Record<string, string> = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM-DD-YYYY": "%m-%d-%Y",
    "YY.MM.DD": "%y.%m.%d",
    "DD.MM.YYYY": "%d.%m.%Y",
    "MM/YYYY": "%m/%Y",
  };
  const translated = formats[format];
  if (!translated)
    fail("QLIK_DATE_FORMAT_NOT_IMPLEMENTED", `${functionName} usa un formato Qlik aún no certificado: ${format}`, functionName, 0);
  return translated;
}

function translateQlikNumberFormat(format: string, functionName: string): string {
  const match = format.match(/^(#,##)?0(?:\.(0+))?$/);
  if (!match)
    fail("QLIK_NUMBER_FORMAT_NOT_IMPLEMENTED", `${functionName} usa un formato Qlik aún no certificado: ${format}`, functionName, 0);
  const grouped = Boolean(match[1]);
  const decimals = match[2]?.length ?? 0;
  const integer = grouped
    ? `${Array.from({ length: 24 }, () => "999").join("G")}G990`
    : `${"9".repeat(74)}0`;
  return `FM${integer}${decimals > 0 ? `D${"0".repeat(decimals)}` : ""}`;
}

function literalString(expression: ExprQlik, functionName: string): string {
  if (expression.kind !== "string")
    fail("FUNCTION_LITERAL_FORMAT_REQUIRED", `${functionName} requiere que el formato/separador sea literal en esta fase`, functionName, 0);
  return expression.value;
}

function arity(name: string, args: ExprQlik[], expected: number): void {
  if (args.length !== expected)
    fail("FUNCTION_ARITY", `${name} requiere ${expected} argumentos y recibió ${args.length}`, name, 0);
}

function arityRange(name: string, args: ExprQlik[], min: number, max: number): void {
  if (args.length < min || args.length > max)
    fail("FUNCTION_ARITY", `${name} requiere entre ${min} y ${max} argumentos y recibió ${args.length}`, name, 0);
}

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parenthesize(sql: string): string {
  return /^[A-Za-z0-9_`.]+$/.test(sql) ? sql : `(${sql})`;
}

function fail(code: string, message: string, source: string, offset: number): never {
  throw new ErrorCompilacionVNext({
    code,
    category: code.startsWith("FUNCTION") || code.startsWith("OPERATOR")
      ? "UNSUPPORTED_SEMANTICS"
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

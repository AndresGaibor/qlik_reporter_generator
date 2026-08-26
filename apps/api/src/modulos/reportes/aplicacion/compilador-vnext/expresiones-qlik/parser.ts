import type { ExprQlik } from "./tipos.js";
import { fail, requiredToken } from "./utilidades.js";

export type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "variable"
  | "operator"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

export interface Token {
  kind: TokenKind;
  text: string;
  value?: string;
  offset: number;
}

export const WORD_OPERATORS = new Set([
  "and",
  "or",
  "xor",
  "not",
  "bitnot",
  "bitand",
  "bitor",
  "bitxor",
  "precedes",
  "follows",
  "like",
]);

export const PRECEDENCE: Record<string, number> = {
  or: 10,
  xor: 15,
  and: 20,
  "=": 30,
  "<>": 30,
  "<": 30,
  ">": 30,
  "<=": 30,
  ">=": 30,
  precedes: 30,
  follows: 30,
  like: 30,
  "&": 35,
  bitor: 37,
  bitxor: 38,
  bitand: 39,
  ">>": 40,
  "<<": 40,
  "+": 50,
  "-": 50,
  "*": 60,
  "/": 60,
};

export function parsearExpresionQlik(text: string): ExprQlik {
  const tokens = tokenize(text);
  let index = 0;
  const current = () =>
    requiredToken(tokens[index] ?? tokens[tokens.length - 1], text);
  const consume = () =>
    requiredToken(tokens[index++] ?? tokens[tokens.length - 1], text);

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
    if (token.kind === "string")
      return { kind: "string", value: token.value ?? "" };
    if (token.kind === "variable")
      return { kind: "variable", name: token.value ?? token.text };
    if (token.kind === "operator" && token.text === "*")
      return { kind: "wildcard" };
    if (
      token.kind === "operator" &&
      ["+", "-", "not", "bitnot"].includes(token.text.toLowerCase())
    ) {
      const operator = token.text.toLowerCase();
      const operandPrecedence = operator === "not" ? 25 : 70;
      return {
        kind: "unary",
        operator,
        operand: parseExpression(operandPrecedence),
      };
    }
    if (token.kind === "lparen") {
      const expression = parseExpression();
      expectToken(consume(), "rparen", text);
      return expression;
    }
    if (token.kind !== "identifier")
      fail(
        "EXPRESSION_EXPECTED",
        `Se esperaba una expresión y se encontró ${token.text}`,
        text,
        token.offset,
      );

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
    return {
      kind: "call",
      name,
      args,
      ...(modifiers.length > 0 ? { modifiers } : {}),
    };
  };

  const expression = parseExpression();
  if (current().kind !== "eof")
    fail(
      "EXPRESSION_UNCONSUMED_TOKENS",
      `Token no consumido: ${current().text}`,
      text,
      current().offset,
    );
  return expression;
}

export function tokenize(text: string): Token[] {
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
        fail(
          "EXPRESSION_UNTERMINATED_STRING",
          "String Qlik sin cerrar",
          text,
          start,
        );
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
        fail(
          "EXPRESSION_UNTERMINATED_IDENTIFIER",
          "Identificador [..] sin cerrar",
          text,
          start,
        );
      i += 1;
      out.push({
        kind: "identifier",
        text: text.slice(start, i),
        value,
        offset: start,
      });
      continue;
    }

    if (c === '"' || c === "`") {
      const start = i++;
      const quote = c;
      let value = "";
      while (i < text.length && text[i] !== quote) value += text[i++] ?? "";
      if (text[i] !== quote)
        fail(
          "EXPRESSION_UNTERMINATED_IDENTIFIER",
          "Identificador quoted sin cerrar",
          text,
          start,
        );
      i += 1;
      out.push({
        kind: "identifier",
        text: text.slice(start, i),
        value,
        offset: start,
      });
      continue;
    }

    if (c === "$" && text[i + 1] === "(") {
      const start = i;
      i += 2;
      const close = text.indexOf(")", i);
      if (close < 0)
        fail(
          "EXPRESSION_UNTERMINATED_VARIABLE",
          "Dollar expansion sin cerrar",
          text,
          start,
        );
      const value = text.slice(i, close).trim();
      i = close + 1;
      out.push({
        kind: "variable",
        text: text.slice(start, i),
        value,
        offset: start,
      });
      continue;
    }

    if (c === "(") {
      out.push({ kind: "lparen", text: c, offset: i++ });
      continue;
    }
    if (c === ")") {
      out.push({ kind: "rparen", text: c, offset: i++ });
      continue;
    }
    if (c === ",") {
      out.push({ kind: "comma", text: c, offset: i++ });
      continue;
    }

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
      while (i < text.length && /[A-Za-z0-9_.$#]/.test(text[i] ?? "")) i += 1;
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

    const symbolic = [
      "<=",
      ">=",
      "<>",
      "<<",
      ">>",
      "+",
      "-",
      "*",
      "/",
      "&",
      "=",
      "<",
      ">",
    ].find((operator) => text.startsWith(operator, i));
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

export function expectToken(
  token: Token,
  kind: TokenKind,
  source: string,
): void {
  if (token.kind !== kind)
    fail(
      "EXPRESSION_UNEXPECTED_TOKEN",
      `Se esperaba ${kind} y se encontró ${token.text}`,
      source,
      token.offset,
    );
}

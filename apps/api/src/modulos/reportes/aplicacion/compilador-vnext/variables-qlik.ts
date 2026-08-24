import { type ExprQlik, parsearExpresionQlik } from "./expresiones-qlik.js";

export type ValorVariableQlik =
  | { estado: "resuelta"; texto: string; numero?: number }
  | { estado: "runtime"; expresion: string };

export type VariablesQlik = Map<string, ValorVariableQlik>;

export class VariableQlikRuntimeError extends Error {
  constructor(
    readonly nombre: string,
    readonly expresion: string,
  ) {
    super(
      `La variable Qlik ${nombre} requiere evaluación en runtime: ${expresion}`,
    );
  }
}

export function expandirVariablesQlik(
  text: string,
  variables: VariablesQlik,
): string {
  let current = text;
  for (let depth = 0; depth < 1000; depth += 1) {
    let changed = false;
    const next = current.replace(
      /\$\(\s*(#?)([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
      (_match, numeric: string, name: string) => {
        changed = true;
        const value = variables.get(name);
        if (!value) return "";
        if (value.estado === "runtime")
          throw new VariableQlikRuntimeError(name, value.expresion);
        if (numeric === "#") return expansionNumerica(value, variables);
        if (value.numero === undefined) return value.texto;
        return numeroConSeparador(value.numero, variables);
      },
    );
    if (!changed || next === current) return next;
    current = next;
  }
  throw new Error("Dollar-sign expansion superó 1000 niveles");
}

export function definirVariableQlik(
  mode: "set" | "let",
  body: string,
  variables: VariablesQlik,
):
  | { nombre: string; valor: ValorVariableQlik; bodyExpandido: string }
  | undefined {
  const match = body.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*?)\s*$/);
  if (!match?.[1] || match[2] === undefined) return undefined;
  const nombre = match[1];
  const rhs = expandirVariablesQlik(match[2], variables);
  const valor = mode === "set" ? valorSet(rhs) : valorLet(rhs);
  variables.set(nombre, valor);
  return { nombre, valor, bodyExpandido: `${nombre}=${rhs}` };
}
function valorSet(rhs: string): ValorVariableQlik {
  const text = rhs.trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'"))
    return { estado: "resuelta", texto: text.slice(1, -1).replace(/''/g, "'") };
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"'))
    return { estado: "resuelta", texto: text.slice(1, -1).replace(/""/g, '"') };
  return { estado: "resuelta", texto: text };
}

function valorLet(rhs: string): ValorVariableQlik {
  try {
    const value = evaluarConstante(parsearExpresionQlik(rhs));
    if (typeof value === "number")
      return {
        estado: "resuelta",
        texto: numeroCanonico(value),
        numero: value,
      };
    return { estado: "resuelta", texto: value };
  } catch {
    return { estado: "runtime", expresion: rhs };
  }
}

function evaluarConstante(expression: ExprQlik): number | string {
  if (expression.kind === "number") return Number(expression.raw);
  if (expression.kind === "string") return expression.value;
  if (expression.kind === "unary") {
    const operand = evaluarConstante(expression.operand);
    if (
      typeof operand !== "number" ||
      !["+", "-"].includes(expression.operator)
    )
      throw new Error("unary no constante");
    return expression.operator === "-" ? -operand : operand;
  }
  if (expression.kind === "binary") {
    const left = evaluarConstante(expression.left);
    const right = evaluarConstante(expression.right);
    if (expression.operator === "&") return `${left}${right}`;
    if (typeof left !== "number" || typeof right !== "number")
      throw new Error("binary no numérico");
    if (expression.operator === "+") return left + right;
    if (expression.operator === "-") return left - right;
    if (expression.operator === "*") return left * right;
    if (expression.operator === "/") return left / right;
  }
  throw new Error("LET requiere runtime");
}

function numeroConSeparador(value: number, variables: VariablesQlik): string {
  const canonical = numeroCanonico(value);
  const decimalSep = variables.get("DecimalSep");
  if (decimalSep?.estado === "resuelta" && decimalSep.texto !== ".")
    return canonical.replace(".", decimalSep.texto);
  return canonical;
}

function expansionNumerica(
  value: Extract<ValorVariableQlik, { estado: "resuelta" }>,
  variables: VariablesQlik,
): string {
  const number = value.numero ?? parsearNumero(value.texto, variables);
  return number === undefined ? "0" : numeroCanonico(number);
}

function parsearNumero(
  text: string,
  variables: VariablesQlik,
): number | undefined {
  let normalized = text.trim();
  const decimalSep = textoVariable(variables, "DecimalSep") ?? ".";
  const thousandSep = textoVariable(variables, "ThousandSep");
  if (thousandSep && thousandSep !== decimalSep)
    normalized = normalized.split(thousandSep).join("");
  if (decimalSep !== ".") normalized = normalized.split(decimalSep).join(".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized))
    return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function textoVariable(
  variables: VariablesQlik,
  name: string,
): string | undefined {
  const value = variables.get(name);
  return value?.estado === "resuelta" ? value.texto : undefined;
}

function numeroCanonico(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Número Qlik no finito");
  if (Object.is(value, -0)) return "0";
  return String(value);
}

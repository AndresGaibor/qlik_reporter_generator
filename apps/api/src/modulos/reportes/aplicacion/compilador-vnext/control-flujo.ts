import { type ExprQlik, parsearExpresionQlik } from "./expresiones-qlik.js";
import { type VariablesQlik, expandirVariablesQlik } from "./variables-qlik.js";

export type ValorConstanteControl = string | number | boolean | null;

export function evaluarControlConstante(
  expression: string,
  variables: VariablesQlik,
): ValorConstanteControl | undefined {
  try {
    return evaluar(
      parsearExpresionQlik(expandirVariablesQlik(expression, variables)),
      variables,
    );
  } catch {
    return undefined;
  }
}

export function evaluarCondicionControl(
  expression: string,
  variables: VariablesQlik,
): boolean | undefined {
  const value = evaluarControlConstante(expression, variables);
  if (value === undefined || value === null)
    return value === null ? false : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric !== 0 : undefined;
}

export function definirConstanteVariable(
  variables: VariablesQlik,
  name: string,
  value: ValorConstanteControl,
): void {
  variables.set(name, {
    estado: "resuelta",
    texto:
      typeof value === "string" ? value : value === null ? "" : String(value),
    ...(typeof value === "number" ? { numero: value } : {}),
  });
}

function evaluar(
  expression: ExprQlik,
  variables: VariablesQlik,
): ValorConstanteControl | undefined {
  switch (expression.kind) {
    case "number":
      return Number(expression.raw);
    case "string":
      return expression.value;
    case "identifier": {
      const lower = expression.name.toLowerCase();
      if (lower === "true") return true;
      if (lower === "false") return false;
      if (lower === "null") return null;
      const variable = variables.get(expression.name);
      if (!variable || variable.estado !== "resuelta") return undefined;
      if (variable.numero !== undefined) return variable.numero;
      return variable.texto;
    }
    case "variable": {
      const variable = variables.get(expression.name);
      if (!variable || variable.estado !== "resuelta") return undefined;
      return variable.numero ?? variable.texto;
    }
    case "call":
      if (
        expression.name.toLowerCase() === "null" &&
        expression.args.length === 0
      )
        return null;
      return undefined;
    case "wildcard":
      return undefined;
    case "unary": {
      const operand = evaluar(expression.operand, variables);
      if (operand === undefined) return undefined;
      if (expression.operator === "not") return !aBoolean(operand);
      if (typeof operand !== "number") return undefined;
      if (expression.operator === "+") return operand;
      if (expression.operator === "-") return -operand;
      return undefined;
    }
    case "binary":
      return evaluarBinario(
        expression.operator,
        expression.left,
        expression.right,
        variables,
      );
  }
}

function evaluarBinario(
  operator: string,
  leftExpression: ExprQlik,
  rightExpression: ExprQlik,
  variables: VariablesQlik,
): ValorConstanteControl | undefined {
  const left = evaluar(leftExpression, variables);
  const right = evaluar(rightExpression, variables);
  if (left === undefined || right === undefined) return undefined;
  if (operator === "&") return `${left ?? ""}${right ?? ""}`;
  if (["and", "or", "xor"].includes(operator)) {
    const a = aBoolean(left);
    const b = aBoolean(right);
    if (operator === "and") return a && b;
    if (operator === "or") return a || b;
    return a !== b;
  }
  if (["=", "<>", "<", ">", "<=", ">="].includes(operator)) {
    if (left === null || right === null)
      return operator === "="
        ? left === null && right === null
        : operator === "<>"
          ? left !== right
          : false;
    if (operator === "=") return left === right;
    if (operator === "<>") return left !== right;
    if (typeof left !== typeof right) return undefined;
    if (operator === "<") return left < right;
    if (operator === ">") return left > right;
    if (operator === "<=") return left <= right;
    return left >= right;
  }
  if (["+", "-", "*", "/"].includes(operator)) {
    if (typeof left !== "number" || typeof right !== "number") return undefined;
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    return right === 0 ? undefined : left / right;
  }
  return undefined;
}

function aBoolean(value: ValorConstanteControl): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric !== 0 : value.length > 0;
}

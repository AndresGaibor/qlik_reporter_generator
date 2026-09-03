import { type ExprQlik, parsearExpresionQlik } from "../expresiones-qlik.js";
import type { CampoLoadVNext } from "../parser-carga.js";

const FUNCIONES_NO_DETERMINISTAS = new Set(["rand"]);

export function esExpresionDeterminista(expression: string): boolean {
  try {
    let deterministic = true;
    visitar(parsearExpresionQlik(expression), (node) => {
      if (
        node.kind === "call" &&
        FUNCIONES_NO_DETERMINISTAS.has(node.name.toLowerCase())
      ) {
        deterministic = false;
      }
    });
    return deterministic;
  } catch {
    return false;
  }
}

export function referenciasExpresion(expression: string): Set<string> {
  const result = new Set<string>();
  visitar(parsearExpresionQlik(expression), (node) => {
    if (node.kind === "identifier") result.add(node.name);
  });
  return result;
}

export function sustituirProyeccionEnExpresion(
  expression: string,
  projections: readonly CampoLoadVNext[],
): string | undefined {
  const projectionMap = construirMapaProyecciones(projections);
  if (!projectionMap) return undefined;
  try {
    const substituted = sustituir(
      parsearExpresionQlik(expression),
      projectionMap,
    );
    return substituted ? imprimir(substituted) : undefined;
  } catch {
    return undefined;
  }
}

function construirMapaProyecciones(
  projections: readonly CampoLoadVNext[],
): Map<string, ExprQlik> | undefined {
  const result = new Map<string, ExprQlik>();
  try {
    for (const projection of projections) {
      if (projection.alias === "*" || result.has(projection.alias))
        return undefined;
      result.set(projection.alias, parsearExpresionQlik(projection.expression));
    }
    return result;
  } catch {
    return undefined;
  }
}

function sustituir(
  expression: ExprQlik,
  projections: ReadonlyMap<string, ExprQlik>,
): ExprQlik | undefined {
  switch (expression.kind) {
    case "identifier":
      return projections.get(expression.name);
    case "call": {
      const args = expression.args.map((arg) => sustituir(arg, projections));
      if (args.some((arg) => !arg)) return undefined;
      return { ...expression, args: args as ExprQlik[] };
    }
    case "unary": {
      const operand = sustituir(expression.operand, projections);
      return operand ? { ...expression, operand } : undefined;
    }
    case "binary": {
      const left = sustituir(expression.left, projections);
      const right = sustituir(expression.right, projections);
      return left && right ? { ...expression, left, right } : undefined;
    }
    case "number":
    case "string":
    case "variable":
    case "wildcard":
      return expression;
  }
}

function visitar(expression: ExprQlik, visit: (node: ExprQlik) => void): void {
  visit(expression);
  switch (expression.kind) {
    case "call":
      for (const arg of expression.args) visitar(arg, visit);
      return;
    case "unary":
      visitar(expression.operand, visit);
      return;
    case "binary":
      visitar(expression.left, visit);
      visitar(expression.right, visit);
      return;
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return;
  }
}

function imprimir(expression: ExprQlik): string {
  switch (expression.kind) {
    case "number":
      return expression.raw;
    case "string":
      return `'${expression.value.replace(/'/g, "''")}'`;
    case "identifier":
      return `[${expression.name}]`;
    case "variable":
      return `$(${expression.name})`;
    case "wildcard":
      return "*";
    case "call": {
      const modifiers = expression.modifiers?.length
        ? `${expression.modifiers.join(" ")} `
        : "";
      return `${expression.name}(${modifiers}${expression.args.map(imprimir).join(", ")})`;
    }
    case "unary":
      return expression.operator === "not" || expression.operator === "bitnot"
        ? `(${expression.operator} ${imprimir(expression.operand)})`
        : `(${expression.operator}${imprimir(expression.operand)})`;
    case "binary":
      return `(${imprimir(expression.left)} ${expression.operator} ${imprimir(expression.right)})`;
  }
}

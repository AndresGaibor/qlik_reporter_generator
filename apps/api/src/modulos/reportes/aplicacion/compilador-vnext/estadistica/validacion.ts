import type { ExprQlik } from "../expresiones-qlik.js";
import type { ContextoEstadistica } from "./tipos.js";

export function validateModifiers(
  name: string,
  modifiers: readonly string[],
  allowDistinct: boolean,
  context: ContextoEstadistica,
): void {
  if (modifiers.includes("total"))
    context.fail(
      "STATISTICS_TOTAL_REQUIRES_SCOPE_LOWERING",
      `${name} TOTAL requiere el ámbito Qlik explícito`,
    );
  if (modifiers.includes("distinct") && !allowDistinct)
    context.fail(
      "STATISTICS_DISTINCT_NOT_SUPPORTED",
      `${name} no documenta DISTINCT en su firma Qlik`,
    );
}

export function requireArity(
  name: string,
  args: ExprQlik[],
  expected: number,
  context: ContextoEstadistica,
): void {
  if (args.length !== expected)
    context.fail(
      "FUNCTION_ARITY",
      `${name} requiere ${expected} argumentos y recibió ${args.length}`,
    );
}

export function requireArityRange(
  name: string,
  args: ExprQlik[],
  min: number,
  max: number,
  context: ContextoEstadistica,
): void {
  if (args.length < min || args.length > max)
    context.fail(
      "FUNCTION_ARITY",
      `${name} requiere entre ${min} y ${max} argumentos y recibió ${args.length}`,
    );
}

export function requiredArgument(
  args: ExprQlik[],
  index: number,
  context: ContextoEstadistica,
): ExprQlik {
  const argument = args[index];
  if (argument) return argument;
  return context.fail(
    "FUNCTION_ARITY",
    `Falta el argumento estadístico ${index + 1}`,
  );
}

export function distinctPrefix(modifiers: readonly string[]): string {
  return modifiers.includes("distinct") ? "DISTINCT " : "";
}

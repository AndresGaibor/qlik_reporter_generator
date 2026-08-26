import { expect } from "bun:test";
import {
  type EntornoExpresionQlik,
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

export function compile(expression: string): string {
  return emitirExpresionBigQuery(parsearExpresionQlik(expression));
}

export function compileWithEnv(
  expression: string,
  environment: EntornoExpresionQlik,
): string {
  return emitirExpresionBigQuery(
    parsearExpresionQlik(expression),
    "value",
    environment,
  );
}
export function compileCondition(expression: string): string {
  return emitirExpresionBigQuery(parsearExpresionQlik(expression), "condition");
}

export function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

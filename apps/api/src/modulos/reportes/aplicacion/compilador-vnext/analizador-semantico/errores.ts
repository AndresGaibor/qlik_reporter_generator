import type { SourceSpan } from "../modelo.js";
import { ErrorCompilacionVNext } from "../modelo.js";

export function fail(
  code: string,
  category: ConstructorParameters<typeof ErrorCompilacionVNext>[0]["category"],
  message: string,
  span: SourceSpan,
  snippet?: string,
): never {
  throw new ErrorCompilacionVNext({
    code,
    category,
    message,
    span,
    ...(snippet ? { snippet: snippet.slice(0, 160) } : {}),
  });
}

export function zeroSpan(): SourceSpan {
  return { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
}

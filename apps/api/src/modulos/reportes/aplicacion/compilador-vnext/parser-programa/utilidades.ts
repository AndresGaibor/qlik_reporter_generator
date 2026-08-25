import type { SentenciaCruda, SourceSpan } from "../modelo.js";
import { ErrorCompilacionVNext } from "../modelo.js";
import { indicePrimerCodigo } from "./sentencias.js";

export function codigo(statement: SentenciaCruda): string {
  const offset = indicePrimerCodigo(statement.text);
  return statement.text
    .slice(offset)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
}

export function clausulaControl(code: string): string | undefined {
  if (/^ELSEIF\b/i.test(code)) return "elseif";
  if (/^ELSE$/i.test(code)) return "else";
  if (/^END\s+IF$/i.test(code)) return "endif";
  if (/^CASE\b/i.test(code)) return "case";
  if (/^DEFAULT$/i.test(code)) return "default";
  if (/^END\s+SWITCH$/i.test(code)) return "endswitch";
  if (/^NEXT(?:\s|$)/i.test(code)) return "next";
  if (/^LOOP(?:\s|$)/i.test(code)) return "loop";
  if (/^END\s+SUB$/i.test(code)) return "endsub";
  return undefined;
}

export function buscarKeyword(text: string, keyword: string): number {
  let quote: string | undefined;
  let bracket = false;
  let depth = 0;
  for (let i = 0; i <= text.length - keyword.length; i += 1) {
    const c = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (bracket) {
      if (c === "]") bracket = next !== "]";
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (next === quote) i += 1;
        else quote = undefined;
      }
      continue;
    }
    if (c === "[") {
      bracket = true;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(") {
      depth += 1;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (
      depth === 0 &&
      text.slice(i, i + keyword.length).toUpperCase() === keyword &&
      !/[A-Za-z0-9_]/.test(text[i - 1] ?? "") &&
      !/[A-Za-z0-9_]/.test(text[i + keyword.length] ?? "")
    )
      return i;
  }
  return -1;
}

export function unirSpans(start: SourceSpan, end: SourceSpan): SourceSpan {
  return {
    start: start.start,
    end: end.end,
    line: start.line,
    column: start.column,
    endLine: end.endLine,
    endColumn: end.endColumn,
  };
}

export function failParser(
  code: string,
  message: string,
  statement: SentenciaCruda,
): never {
  throw new ErrorCompilacionVNext({
    code,
    category: "SYNTAX",
    message,
    span: statement.span,
    snippet: statement.text,
  });
}

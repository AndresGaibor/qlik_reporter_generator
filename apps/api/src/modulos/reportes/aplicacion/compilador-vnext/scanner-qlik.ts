import {
  ErrorCompilacionVNext,
  type SentenciaCruda,
  type SourceSpan,
} from "./modelo.js";

type Mode =
  | "normal"
  | "single"
  | "double"
  | "backtick"
  | "bracket"
  | "line_comment"
  | "block_comment";

export function escanearSentenciasQlik(script: string): SentenciaCruda[] {
  const lineStarts = construirIniciosLinea(script);
  const statements: SentenciaCruda[] = [];
  let mode: Mode = "normal";
  let modeStart = 0;
  let statementStart = 0;

  for (let i = 0; i < script.length; i += 1) {
    const c = script[i] ?? "";
    const next = script[i + 1] ?? "";

    if (mode === "line_comment") {
      if (c === "\n") mode = "normal";
      continue;
    }
    if (mode === "block_comment") {
      if (c === "*" && next === "/") {
        mode = "normal";
        i += 1;
      }
      continue;
    }
    if (mode === "bracket") {
      if (c === "]") {
        if (next === "]") i += 1;
        else mode = "normal";
      }
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "backtick") {
      const quote = mode === "single" ? "'" : mode === "double" ? '"' : "`";
      if (c === quote && !estaEscapado(script, i)) {
        if (next === quote) i += 1;
        else mode = "normal";
      }
      continue;
    }

    if ((c === "/" && next === "/") || (c === "-" && next === "-")) {
      mode = "line_comment";
      modeStart = i;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      mode = "block_comment";
      modeStart = i;
      i += 1;
      continue;
    }
    if (c === "[") {
      mode = "bracket";
      modeStart = i;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      mode = c === "'" ? "single" : c === '"' ? "double" : "backtick";
      modeStart = i;
      continue;
    }
    if (c === ";") {
      agregarSentencia(statements, script, statementStart, i, true, lineStarts);
      statementStart = i + 1;
    }
  }

  if (mode !== "normal" && mode !== "line_comment") {
    throw errorModoSinCerrar(mode, modeStart, script, lineStarts);
  }
  agregarSentencia(
    statements,
    script,
    statementStart,
    script.length,
    false,
    lineStarts,
  );
  return statements;
}

function agregarSentencia(
  output: SentenciaCruda[],
  script: string,
  rawStart: number,
  rawEnd: number,
  terminatedBySemicolon: boolean,
  lineStarts: number[],
): void {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && /\s/.test(script[start] ?? "")) start += 1;
  while (end > start && /\s/.test(script[end - 1] ?? "")) end -= 1;
  if (start === end) return;
  output.push({
    text: script.slice(start, end),
    span: crearSpan(start, end, lineStarts),
    terminatedBySemicolon,
  });
}

function estaEscapado(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function construirIniciosLinea(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function posicion(
  index: number,
  lineStarts: number[],
): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lineStarts[mid] ?? 0) <= index) lo = mid + 1;
    else hi = mid - 1;
  }
  const lineIndex = Math.max(0, hi);
  return {
    line: lineIndex + 1,
    column: index - (lineStarts[lineIndex] ?? 0) + 1,
  };
}

function crearSpan(
  start: number,
  end: number,
  lineStarts: number[],
): SourceSpan {
  const first = posicion(start, lineStarts);
  const last = posicion(Math.max(start, end - 1), lineStarts);
  return {
    start,
    end,
    line: first.line,
    column: first.column,
    endLine: last.line,
    endColumn: last.column + (end > start ? 1 : 0),
  };
}

function errorModoSinCerrar(
  mode: Exclude<Mode, "normal" | "line_comment">,
  start: number,
  script: string,
  lineStarts: number[],
): ErrorCompilacionVNext {
  const byMode = {
    single: ["LEXER_UNTERMINATED_STRING", "Cadena sin cerrar"],
    double: [
      "LEXER_UNTERMINATED_STRING",
      "Cadena o identificador entre comillas sin cerrar",
    ],
    backtick: [
      "LEXER_UNTERMINATED_IDENTIFIER",
      "Identificador con backticks sin cerrar",
    ],
    bracket: [
      "LEXER_UNTERMINATED_IDENTIFIER",
      "Identificador Qlik entre corchetes sin cerrar",
    ],
    block_comment: [
      "LEXER_UNTERMINATED_BLOCK_COMMENT",
      "Comentario de bloque sin cerrar",
    ],
  } as const;
  const [code, message] = byMode[mode];
  return new ErrorCompilacionVNext({
    code,
    category: "LEXER",
    message,
    span: crearSpan(start, script.length, lineStarts),
    snippet: script.slice(start, Math.min(script.length, start + 120)),
  });
}

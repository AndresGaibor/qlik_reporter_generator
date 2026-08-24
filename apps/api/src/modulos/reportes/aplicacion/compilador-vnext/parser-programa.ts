import type {
  LoadPrefix,
  QlikIfBranch,
  QlikProgram,
  QlikStatement,
  QlikSwitchCase,
} from "./ast.js";
import {
  ErrorCompilacionVNext,
  type SentenciaCruda,
  type SourceSpan,
} from "./modelo.js";
import { dividirTopLevel } from "./parser-carga.js";
import { escanearSentenciasQlik } from "./scanner-qlik.js";

export function parsearProgramaQlik(script: string): QlikProgram {
  const rawStatements = escanearSentenciasQlik(script);
  const parsed = parsearBloque(rawStatements, 0);
  if (parsed.nextIndex !== rawStatements.length) {
    const statement = rawStatements[parsed.nextIndex];
    if (statement) {
      failParser(
        "SYNTAX_UNEXPECTED_CONTROL_CLAUSE",
        `Cláusula de control inesperada: ${codigo(statement)}`,
        statement,
      );
    }
  }
  return { statements: parsed.statements };
}

function parsearBloque(
  rawStatements: SentenciaCruda[],
  startIndex: number,
  terminators: Set<string> = new Set(),
): { statements: QlikStatement[]; nextIndex: number; terminator?: string } {
  const statements: QlikStatement[] = [];
  let index = startIndex;
  while (index < rawStatements.length) {
    const raw = rawStatements[index];
    if (!raw) break;
    if (!codigo(raw)) {
      index += 1;
      continue;
    }
    const clause = clausulaControl(codigo(raw));
    if (clause && terminators.has(clause))
      return { statements, nextIndex: index, terminator: clause };
    if (clause) {
      failParser(
        "SYNTAX_UNEXPECTED_CONTROL_CLAUSE",
        `Cláusula de control inesperada: ${codigo(raw)}`,
        raw,
      );
    }
    const parsed = parsearSentenciaConBloque(rawStatements, index);
    statements.push(parsed.statement);
    index = parsed.nextIndex;
  }
  return { statements, nextIndex: index };
}

function parsearSentenciaConBloque(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const raw = rawStatements[index];
  if (!raw) throw new Error("sentencia Qlik inexistente");
  const code = codigo(raw);
  if (/^IF\b/i.test(code)) return parsearIf(rawStatements, index);
  if (/^SWITCH\b/i.test(code)) return parsearSwitch(rawStatements, index);
  if (/^FOR\b/i.test(code)) return parsearFor(rawStatements, index);
  if (/^DO\b/i.test(code)) return parsearDo(rawStatements, index);
  if (/^SUB\b/i.test(code)) return parsearSub(rawStatements, index);
  return { statement: parsearSentencia(raw), nextIndex: index + 1 };
}

function parsearIf(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const header = rawStatements[index];
  if (!header) throw new Error("cabecera IF inexistente");
  const match = codigo(header).match(/^IF\s+([\s\S]+?)\s+THEN$/i);
  if (!match?.[1])
    failParser("SYNTAX_INVALID_IF", "IF requiere una condición y THEN", header);

  const branches: QlikIfBranch[] = [];
  let condition = match[1].trim();
  let cursor = index + 1;
  let elseStatements: QlikStatement[] = [];
  let end: SentenciaCruda | undefined;
  while (true) {
    const body = parsearBloque(
      rawStatements,
      cursor,
      new Set(["elseif", "else", "endif"]),
    );
    const marker = rawStatements[body.nextIndex];
    if (!marker || !body.terminator) {
      failParser("SYNTAX_UNTERMINATED_IF", "IF sin END IF", header);
    }
    branches.push({
      condition,
      statements: body.statements,
      span: unirSpans(header.span, marker.span),
    });
    cursor = body.nextIndex;
    if (body.terminator === "elseif") {
      const elseif = codigo(marker).match(/^ELSEIF\s+([\s\S]+?)\s+THEN$/i);
      if (!elseif?.[1])
        failParser(
          "SYNTAX_INVALID_ELSEIF",
          "ELSEIF requiere una condición y THEN",
          marker,
        );
      condition = elseif[1].trim();
      cursor += 1;
      continue;
    }
    if (body.terminator === "else") {
      const elseBody = parsearBloque(
        rawStatements,
        cursor + 1,
        new Set(["endif"]),
      );
      const endMarker = rawStatements[elseBody.nextIndex];
      if (!endMarker || elseBody.terminator !== "endif")
        failParser("SYNTAX_UNTERMINATED_IF", "ELSE sin END IF", marker);
      elseStatements = elseBody.statements;
      end = endMarker;
    } else {
      end = marker;
    }
    break;
  }
  if (!end) throw new Error("END IF inexistente");
  const endIndex = rawStatements.indexOf(end);
  return {
    statement: {
      type: "if",
      branches,
      elseStatements,
      span: unirSpans(header.span, end.span),
      raw: rawStatements
        .slice(index, endIndex + 1)
        .map((item) => item?.text ?? "")
        .join("\n"),
    },
    nextIndex: endIndex + 1,
  };
}

function parsearSwitch(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const header = rawStatements[index];
  if (!header) throw new Error("cabecera SWITCH inexistente");
  const expression = codigo(header)
    .replace(/^SWITCH\s+/i, "")
    .trim();
  if (!expression)
    failParser(
      "SYNTAX_INVALID_SWITCH",
      "SWITCH requiere una expresión",
      header,
    );
  const cases: QlikSwitchCase[] = [];
  let cursor = index + 1;
  let defaultStatements: QlikStatement[] = [];
  let end: SentenciaCruda | undefined;
  while (true) {
    const marker = rawStatements[cursor];
    if (!marker)
      failParser("SYNTAX_UNTERMINATED_SWITCH", "SWITCH sin END SWITCH", header);
    const clause = clausulaControl(codigo(marker));
    if (clause === "case") {
      const values = dividirTopLevel(
        codigo(marker)
          .replace(/^CASE\s+/i, "")
          .trim(),
      );
      if (values.length === 0)
        failParser(
          "SYNTAX_INVALID_CASE",
          "CASE requiere al menos un valor",
          marker,
        );
      const body = parsearBloque(
        rawStatements,
        cursor + 1,
        new Set(["case", "default", "endswitch"]),
      );
      const boundary = rawStatements[body.nextIndex];
      if (!boundary || !body.terminator)
        failParser("SYNTAX_UNTERMINATED_SWITCH", "CASE sin END SWITCH", marker);
      cases.push({
        values,
        statements: body.statements,
        span: unirSpans(marker.span, boundary.span),
      });
      cursor = body.nextIndex;
      if (body.terminator === "case") continue;
      if (body.terminator === "default") {
        const defaultBody = parsearBloque(
          rawStatements,
          cursor + 1,
          new Set(["endswitch"]),
        );
        const endMarker = rawStatements[defaultBody.nextIndex];
        if (!endMarker || defaultBody.terminator !== "endswitch")
          failParser(
            "SYNTAX_UNTERMINATED_SWITCH",
            "DEFAULT sin END SWITCH",
            marker,
          );
        defaultStatements = defaultBody.statements;
        end = endMarker;
      } else {
        end = boundary;
      }
      break;
    }
    if (clause === "default") {
      const defaultBody = parsearBloque(
        rawStatements,
        cursor + 1,
        new Set(["endswitch"]),
      );
      const endMarker = rawStatements[defaultBody.nextIndex];
      if (!endMarker || defaultBody.terminator !== "endswitch")
        failParser(
          "SYNTAX_UNTERMINATED_SWITCH",
          "DEFAULT sin END SWITCH",
          marker,
        );
      defaultStatements = defaultBody.statements;
      end = endMarker;
      break;
    }
    if (clause === "endswitch") {
      end = marker;
      break;
    }
    failParser(
      "SYNTAX_SWITCH_CASE_EXPECTED",
      "SWITCH requiere CASE, DEFAULT o END SWITCH",
      marker,
    );
  }
  if (!end) throw new Error("END SWITCH inexistente");
  const endIndex = rawStatements.indexOf(end);
  return {
    statement: {
      type: "switch",
      expression,
      cases,
      defaultStatements,
      span: unirSpans(header.span, end.span),
      raw: rawStatements
        .slice(index, endIndex + 1)
        .map((item) => item?.text ?? "")
        .join("\n"),
    },
    nextIndex: endIndex + 1,
  };
}

function parsearFor(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const header = rawStatements[index];
  if (!header) throw new Error("cabecera FOR inexistente");
  const text = codigo(header);
  const each = text.match(
    /^FOR\s+EACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+([\s\S]+)$/i,
  );
  const counter = text.match(
    /^FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/i,
  );
  let statement: Extract<QlikStatement, { type: "for" }>;
  if (each?.[1] && each[2]) {
    statement = {
      type: "for",
      variable: each[1],
      mode: "each",
      values: dividirTopLevel(each[2]),
      body: [],
      span: header.span,
      raw: header.text,
    };
  } else if (counter?.[1] && counter[2]) {
    const toIndex = buscarKeyword(counter[2], "TO");
    if (toIndex < 0)
      failParser("SYNTAX_INVALID_FOR", "FOR requiere TO", header);
    const from = counter[2].slice(0, toIndex).trim();
    const rest = counter[2].slice(toIndex + 2).trim();
    const stepIndex = buscarKeyword(rest, "STEP");
    statement = {
      type: "for",
      variable: counter[1],
      mode: "counter",
      from,
      to: (stepIndex < 0 ? rest : rest.slice(0, stepIndex)).trim(),
      ...(stepIndex < 0 ? {} : { step: rest.slice(stepIndex + 4).trim() }),
      body: [],
      span: header.span,
      raw: header.text,
    };
  } else {
    failParser(
      "SYNTAX_INVALID_FOR",
      "FOR requiere EACH/IN o contador/TO",
      header,
    );
  }
  const body = parsearBloque(rawStatements, index + 1, new Set(["next"]));
  const end = rawStatements[body.nextIndex];
  if (!end || body.terminator !== "next")
    failParser("SYNTAX_UNTERMINATED_FOR", "FOR sin NEXT", header);
  const nextVariable = codigo(end)
    .replace(/^NEXT\s*/i, "")
    .trim();
  if (
    nextVariable &&
    nextVariable.toLowerCase() !== statement.variable.toLowerCase()
  )
    failParser(
      "SYNTAX_FOR_COUNTER_MISMATCH",
      "NEXT no coincide con el contador de FOR",
      end,
    );
  statement.body = body.statements;
  statement.span = unirSpans(header.span, end.span);
  statement.raw = rawStatements
    .slice(index, body.nextIndex + 1)
    .map((item) => item?.text ?? "")
    .join("\n");
  return { statement, nextIndex: body.nextIndex + 1 };
}

function parsearDo(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const header = rawStatements[index];
  if (!header) throw new Error("cabecera DO inexistente");
  const match = codigo(header).match(/^DO(?:\s+(WHILE|UNTIL)\s+([\s\S]+))?$/i);
  if (codigo(header) !== "DO" && !match?.[1])
    failParser(
      "SYNTAX_INVALID_DO",
      "DO requiere WHILE/UNTIL o una cabecera vacía",
      header,
    );
  const body = parsearBloque(rawStatements, index + 1, new Set(["loop"]));
  const end = rawStatements[body.nextIndex];
  if (!end || body.terminator !== "loop")
    failParser("SYNTAX_UNTERMINATED_DO", "DO sin LOOP", header);
  const loop = codigo(end).match(/^LOOP(?:\s+(WHILE|UNTIL)\s+([\s\S]+))?$/i);
  if (!loop) failParser("SYNTAX_INVALID_LOOP", "LOOP inválido", end);
  if (match?.[1] && loop?.[1])
    failParser(
      "SYNTAX_DO_TWO_CONDITIONS",
      "DO..LOOP solo puede tener una condición",
      end,
    );
  const statement: QlikStatement = {
    type: "do",
    ...(match?.[1] && match[2]
      ? {
          entryCondition: {
            mode: match[1].toLowerCase() as "while" | "until",
            expression: match[2].trim(),
          },
        }
      : {}),
    ...(loop?.[1] && loop[2]
      ? {
          exitCondition: {
            mode: loop[1].toLowerCase() as "while" | "until",
            expression: loop[2].trim(),
          },
        }
      : {}),
    body: body.statements,
    span: unirSpans(header.span, end.span),
    raw: rawStatements
      .slice(index, body.nextIndex + 1)
      .map((item) => item?.text ?? "")
      .join("\n"),
  };
  return { statement, nextIndex: body.nextIndex + 1 };
}

function parsearSub(
  rawStatements: SentenciaCruda[],
  index: number,
): { statement: QlikStatement; nextIndex: number } {
  const header = rawStatements[index];
  if (!header) throw new Error("cabecera SUB inexistente");
  const match = codigo(header).match(
    /^SUB\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?$/i,
  );
  if (!match?.[1])
    failParser("SYNTAX_INVALID_SUB", "SUB requiere un nombre", header);
  const body = parsearBloque(rawStatements, index + 1, new Set(["endsub"]));
  const end = rawStatements[body.nextIndex];
  if (!end || body.terminator !== "endsub")
    failParser("SYNTAX_UNTERMINATED_SUB", "SUB sin END SUB", header);
  const parameters = match[2]
    ? dividirTopLevel(match[2]).map((item) => item.trim())
    : [];
  if (parameters.some((item) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item)))
    failParser(
      "SYNTAX_INVALID_SUB_PARAMETER",
      "Parámetro de SUB inválido",
      header,
    );
  const statement: QlikStatement = {
    type: "sub",
    name: match[1],
    parameters,
    body: body.statements,
    span: unirSpans(header.span, end.span),
    raw: rawStatements
      .slice(index, body.nextIndex + 1)
      .map((item) => item?.text ?? "")
      .join("\n"),
  };
  return { statement, nextIndex: body.nextIndex + 1 };
}

function parsearSentencia(statement: SentenciaCruda): QlikStatement {
  const offset = indicePrimerCodigo(statement.text);
  const code = statement.text.slice(offset);
  const span = desplazarSpan(statement.span, statement.text, offset);

  const connect = code.match(/^(?:LIB\s+)?CONNECT\s+TO\s+\[([^\]]+)\]\s*$/i);
  if (connect?.[1]) {
    return {
      type: "connect",
      connection: connect[1].trim(),
      span,
      raw: statement.text,
    };
  }

  let body = code;
  let prefix: LoadPrefix = { type: "none" };
  const leadingPrefix = extraerPrefijoLoad(body);
  if (leadingPrefix) {
    prefix = leadingPrefix.prefix;
    body = leadingPrefix.rest;
  }

  let label: string | undefined;
  const labelMatch = body.match(/^\[([^\]]+)\]\s*:\s*/);
  if (labelMatch) {
    label = labelMatch[1]?.trim();
    body = body.slice(labelMatch[0].length).trimStart();
  }

  const localPrefix = extraerPrefijoLoad(body);
  if (localPrefix) {
    if (prefix.type !== "none") {
      return {
        type: "unsupported",
        keyword: "PREFIX_COMBINATION",
        span,
        raw: statement.text,
      };
    }
    prefix = localPrefix.prefix;
    body = localPrefix.rest;
  }

  const load = body.match(/^LOAD\b([\s\S]*)$/i);
  if (load) {
    const loadBody = (load[1] ?? "").trim();
    return {
      type: "load",
      ...(label ? { label } : {}),
      body: loadBody,
      wildcard: /^DISTINCT\s+\*/i.test(loadBody) || loadBody === "*",
      prefix,
      span,
      raw: statement.text,
    };
  }

  const sql = code.match(/^SQL\b([\s\S]*)$/i);
  if (sql) {
    const sqlText = (sql[1] ?? "").trim();
    const sqlOffsetInCode = code.indexOf(sql[1] ?? "");
    return {
      type: "native_sql",
      sql: {
        dialect: "bigquery",
        text: sqlText,
        span: desplazarSpan(span, code, Math.max(0, sqlOffsetInCode)),
      },
      span,
      raw: statement.text,
    };
  }

  const store = code.match(/^STORE\b([\s\S]*)$/i);
  if (store) {
    return {
      type: "store",
      body: (store[1] ?? "").trim(),
      span,
      raw: statement.text,
    };
  }
  const drop = code.match(/^DROP\b([\s\S]*)$/i);
  if (drop) {
    return {
      type: "drop",
      body: (drop[1] ?? "").trim(),
      span,
      raw: statement.text,
    };
  }
  const set = code.match(/^(SET|LET)\b([\s\S]*)$/i);
  if (set) {
    return {
      type: "set",
      mode: set[1]?.toLowerCase() === "let" ? "let" : "set",
      body: (set[2] ?? "").trim(),
      span,
      raw: statement.text,
    };
  }

  const call = code.match(
    /^CALL\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?$/i,
  );
  if (call?.[1]) {
    return {
      type: "call",
      name: call[1],
      arguments: call[2] ? dividirTopLevel(call[2]) : [],
      span,
      raw: statement.text,
    };
  }

  const exit = code.match(
    /^EXIT\s+(SCRIPT|FOR|DO|SUB)(?:\s+(WHEN|UNLESS)\s+([\s\S]+))?$/i,
  );
  if (exit?.[1]) {
    return {
      type: "exit",
      target: exit[1].toLowerCase() as "script" | "for" | "do" | "sub",
      ...(exit[2]
        ? { modifier: exit[2].toLowerCase() as "when" | "unless" }
        : {}),
      ...(exit[3] ? { condition: exit[3].trim() } : {}),
      span,
      raw: statement.text,
    };
  }

  return {
    type: "unsupported",
    keyword: code.match(/^([A-Za-z_]+)/)?.[1] ?? "DESCONOCIDA",
    span,
    raw: statement.text,
  };
}

function indicePrimerCodigo(text: string): number {
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i] ?? "")) i += 1;
    if (text.startsWith("//", i) || text.startsWith("--", i)) {
      const newline = text.indexOf("\n", i + 2);
      if (newline < 0) return text.length;
      i = newline + 1;
      continue;
    }
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return text.length;
      i = end + 2;
      continue;
    }
    break;
  }
  return i;
}

function desplazarSpan(
  base: SourceSpan,
  text: string,
  offset: number,
): SourceSpan {
  if (offset <= 0) return base;
  const prefix = text.slice(0, offset);
  const lines = prefix.split("\n");
  const lineDelta = lines.length - 1;
  const column =
    lineDelta === 0 ? base.column + offset : (lines.at(-1)?.length ?? 0) + 1;
  return {
    ...base,
    start: base.start + offset,
    line: base.line + lineDelta,
    column,
  };
}

function extraerPrefijoLoad(
  text: string,
): { prefix: LoadPrefix; rest: string } | undefined {
  const mapping = text.match(/^MAPPING\b\s*/i);
  if (mapping)
    return {
      prefix: { type: "mapping" },
      rest: text.slice(mapping[0].length).trimStart(),
    };

  const noConcat = text.match(/^NOCONCATENATE\b\s*/i);
  if (noConcat)
    return {
      prefix: { type: "noconcatenate" },
      rest: text.slice(noConcat[0].length).trimStart(),
    };

  const joinKeep = text.match(
    /^(?:(INNER|LEFT|RIGHT|FULL)\s+)?(JOIN|KEEP)\s*(?:\(\s*\[?([^\]\)]+)\]?\s*\))?\s*/i,
  );
  if (joinKeep) {
    const operation = joinKeep[2]?.toLowerCase();
    const side = (joinKeep[1]?.toLowerCase() ??
      (operation === "join" ? "full" : "inner")) as
      | "inner"
      | "left"
      | "right"
      | "full";
    const target = joinKeep[3]?.trim();
    if (operation === "keep" && side === "full") return undefined;
    return {
      prefix:
        operation === "join"
          ? { type: "join", join: side, ...(target ? { target } : {}) }
          : {
              type: "keep",
              keep: side as "inner" | "left" | "right",
              ...(target ? { target } : {}),
            },
      rest: text.slice(joinKeep[0].length).trimStart(),
    };
  }

  const concatenate = text.match(
    /^CONCATENATE\s*(?:\(\s*\[?([^\]\)]+)\]?\s*\))?\s*/i,
  );
  if (concatenate) {
    const target = concatenate[1]?.trim();
    return {
      prefix: { type: "concatenate", ...(target ? { target } : {}) },
      rest: text.slice(concatenate[0].length).trimStart(),
    };
  }

  const cross = text.match(
    /^CROSSTABLE\s*\(\s*([^,]+?)\s*,\s*([^,\)]+?)(?:\s*,\s*([^\)]+?))?\s*\)\s*/i,
  );
  if (cross) {
    return {
      prefix: {
        type: "crosstable",
        attributeField: normalizarNombrePrefijo(cross[1] ?? "Attribute"),
        dataField: normalizarNombrePrefijo(cross[2] ?? "Data"),
        qualifierFields: Number.parseInt((cross[3] ?? "1").trim(), 10),
      },
      rest: text.slice(cross[0].length).trimStart(),
    };
  }

  const generic = text.match(/^GENERIC\b\s*/i);
  if (generic)
    return {
      prefix: { type: "generic" },
      rest: text.slice(generic[0].length).trimStart(),
    };

  const first = text.match(/^FIRST\s+(?:\(([^\)]+)\)|([^\s]+))\s*/i);
  if (first) {
    return {
      prefix: {
        type: "first",
        limitExpression: (first[1] ?? first[2] ?? "").trim(),
      },
      rest: text.slice(first[0].length).trimStart(),
    };
  }
  return undefined;
}

function normalizarNombrePrefijo(value: string): string {
  const text = value.trim();
  return text
    .replace(/^\[|\]$/g, "")
    .replace(/^`|`$/g, "")
    .replace(/^"|"$/g, "");
}

function codigo(statement: SentenciaCruda): string {
  const offset = indicePrimerCodigo(statement.text);
  return statement.text
    .slice(offset)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
}

function clausulaControl(code: string): string | undefined {
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

function buscarKeyword(text: string, keyword: string): number {
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

function unirSpans(start: SourceSpan, end: SourceSpan): SourceSpan {
  return {
    start: start.start,
    end: end.end,
    line: start.line,
    column: start.column,
    endLine: end.endLine,
    endColumn: end.endColumn,
  };
}

function failParser(
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

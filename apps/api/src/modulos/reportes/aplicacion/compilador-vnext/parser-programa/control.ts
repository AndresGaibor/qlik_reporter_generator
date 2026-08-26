import type { QlikIfBranch, QlikStatement, QlikSwitchCase } from "../ast.js";
import type { SentenciaCruda } from "../modelo.js";
import { dividirTopLevel } from "../parser-carga.js";
import { parsearSentencia } from "./sentencias.js";
import {
  buscarKeyword,
  clausulaControl,
  codigo,
  failParser,
  unirSpans,
} from "./utilidades.js";

export function parsearBloque(
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

export function parsearSentenciaConBloque(
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

export function parsearIf(
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

export function parsearSwitch(
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

export function parsearFor(
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

export function parsearDo(
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

export function parsearSub(
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

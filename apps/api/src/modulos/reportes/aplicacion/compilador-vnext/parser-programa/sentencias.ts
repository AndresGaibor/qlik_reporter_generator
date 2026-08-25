import type { LoadPrefix, QlikStatement } from "../ast.js";
import type { SentenciaCruda, SourceSpan } from "../modelo.js";
import { dividirTopLevel } from "../parser-carga.js";

export function parsearSentencia(statement: SentenciaCruda): QlikStatement {
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
    body = body.slice(indicePrimerCodigo(body));
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
    body = body.slice(indicePrimerCodigo(body));
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

  if (/^SELECT\b/i.test(code)) {
    return {
      type: "native_sql",
      sql: {
        dialect: "bigquery",
        text: code,
        span,
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

export function indicePrimerCodigo(text: string): number {
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

export function desplazarSpan(
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

export function extraerPrefijoLoad(
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

export function normalizarNombrePrefijo(value: string): string {
  const text = value.trim();
  return text
    .replace(/^\[|\]$/g, "")
    .replace(/^`|`$/g, "")
    .replace(/^"|"$/g, "");
}

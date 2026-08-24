export interface CampoLoadVNext {
  expression: string;
  alias: string;
}

export interface OrdenLoadVNext {
  expression: string;
  direction: "asc" | "desc";
}

export interface EspecificacionLoadVNext {
  fields: CampoLoadVNext[];
  wildcard: boolean;
  distinct: boolean;
  resident?: string;
  where?: string;
  while?: string;
  groupBy: string[];
  orderBy: OrdenLoadVNext[];
}

const CLAUSES = ["RESIDENT", "WHERE", "WHILE", "GROUP BY", "ORDER BY"] as const;

export function parsearCuerpoLoad(body: string): EspecificacionLoadVNext {
  const clauses = encontrarClausulas(body);
  const fieldsEnd = clauses[0]?.index ?? body.length;
  const rawFieldsText = body.slice(0, fieldsEnd).trim();
  const distinct = /^DISTINCT\b/i.test(rawFieldsText);
  const fieldsText = distinct
    ? rawFieldsText.replace(/^DISTINCT\b\s*/i, "")
    : rawFieldsText;
  const values = new Map<string, string>();
  for (let i = 0; i < clauses.length; i += 1) {
    const current = clauses[i];
    if (!current) continue;
    const end = clauses[i + 1]?.index ?? body.length;
    values.set(
      current.keyword,
      body.slice(current.index + current.keyword.length, end).trim(),
    );
  }

  const fields = dividirTopLevel(fieldsText).map(parsearCampo);
  const residentRaw = values.get("RESIDENT");
  const where = values.get("WHERE");
  const whileCondition = values.get("WHILE");
  const groupByRaw = values.get("GROUP BY");
  const orderByRaw = values.get("ORDER BY");

  return {
    fields,
    wildcard: fields.length === 1 && fields[0]?.expression === "*",
    distinct,
    ...(residentRaw ? { resident: normalizarNombre(residentRaw) } : {}),
    ...(where ? { where } : {}),
    ...(whileCondition ? { while: whileCondition } : {}),
    groupBy: groupByRaw ? dividirTopLevel(groupByRaw) : [],
    orderBy: orderByRaw ? dividirTopLevel(orderByRaw).map(parsearOrden) : [],
  };
}

function encontrarClausulas(
  text: string,
): Array<{ keyword: string; index: number }> {
  const result: Array<{ keyword: string; index: number }> = [];
  let quote: string | undefined;
  let bracket = false;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (bracket) {
      if (c === "]") {
        if (next === "]") i += 1;
        else bracket = false;
      }
      continue;
    }
    if (quote) {
      if (c === quote && !estaEscapado(text, i)) {
        if (next === quote) i += 1;
        else quote = undefined;
      }
      continue;
    }
    if ((c === "/" && next === "/") || (c === "-" && next === "-")) {
      lineComment = true;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      blockComment = true;
      i += 1;
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
    if (depth !== 0) continue;

    for (const keyword of CLAUSES) {
      if (coincideKeyword(text, i, keyword)) {
        result.push({ keyword, index: i });
        i += keyword.length - 1;
        break;
      }
    }
  }
  return result.sort((a, b) => a.index - b.index);
}

export function dividirTopLevel(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  let bracket = false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (bracket) {
      current += c;
      if (c === "]") {
        if (next === "]") {
          current += next;
          i += 1;
        } else bracket = false;
      }
      continue;
    }
    if (quote) {
      current += c;
      if (c === quote && !estaEscapado(text, i)) {
        if (next === quote) {
          current += next;
          i += 1;
        } else quote = undefined;
      }
      continue;
    }
    if (c === "[") bracket = true;
    else if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0 && !quote && !bracket) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parsearCampo(part: string): CampoLoadVNext {
  if (part.trim() === "*") return { expression: "*", alias: "*" };
  const match = part.match(
    /\s+AS\s+(?:\[([^\]]+)\]|`([^`]+)`|"([^"]+)"|([A-Za-z_][A-Za-z0-9_ ]*))\s*$/i,
  );
  if (match?.index !== undefined) {
    const alias = match
      .slice(1)
      .find((value) => value !== undefined)
      ?.trim();
    if (alias) return { expression: part.slice(0, match.index).trim(), alias };
  }
  return { expression: part.trim(), alias: nombreCampo(part.trim()) };
}

function parsearOrden(part: string): OrdenLoadVNext {
  const match = part.match(/^(.*?)(?:\s+(ASC|DESC))?\s*$/i);
  return {
    expression: match?.[1]?.trim() || part.trim(),
    direction: match?.[2]?.toLowerCase() === "desc" ? "desc" : "asc",
  };
}

function nombreCampo(expression: string): string {
  const bracket = expression.match(/^\[([^\]]+)\]$/);
  if (bracket?.[1]) return bracket[1];
  const tick = expression.match(/^`([^`]+)`$/);
  if (tick?.[1]) return tick[1].split(".").at(-1) ?? tick[1];
  const simple = expression.match(/^(?:[A-Za-z_][\w]*\.)?([A-Za-z_][\w ]*)$/);
  return simple?.[1]?.trim() || expression;
}

function normalizarNombre(name: string): string {
  const trimmed = name.trim();
  const bracket = trimmed.match(/^\[([^\]]+)\]$/);
  const tick = trimmed.match(/^`([^`]+)`$/);
  return bracket?.[1]?.trim() ?? tick?.[1]?.trim() ?? trimmed;
}

function coincideKeyword(
  text: string,
  index: number,
  keyword: string,
): boolean {
  if (text.slice(index, index + keyword.length).toUpperCase() !== keyword)
    return false;
  const before = text[index - 1] ?? " ";
  const after = text[index + keyword.length] ?? " ";
  return !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after);
}

function estaEscapado(text: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) count += 1;
  return count % 2 === 1;
}

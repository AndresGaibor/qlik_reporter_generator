import type {
  ResultadoCalidadSql,
  SqlQualityExpectation,
  ViolacionConformance,
} from "./tipos.js";

export function evaluarCalidadSql(
  sql: string,
  expectation: SqlQualityExpectation,
): ResultadoCalidadSql {
  const normalizedSql = normalizarSql(sql);
  const searchable = normalizedSql.toLowerCase();
  const violations: ViolacionConformance[] = [];
  for (const required of expectation.required ?? []) {
    if (!searchable.includes(normalizarSql(required).toLowerCase())) {
      violations.push({
        code: "SQL_REQUIRED_FRAGMENT_MISSING",
        message: `Falta el fragmento SQL requerido: ${required}`,
      });
    }
  }
  for (const forbidden of expectation.forbidden ?? []) {
    const structuralFragment = normalizarSql(
      quitarLiteralesYComentarios(sql),
    ).toLowerCase();
    if (structuralFragment.includes(normalizarSql(forbidden).toLowerCase())) {
      violations.push({
        code: "SQL_FORBIDDEN_FRAGMENT",
        message: `La salida contiene complejidad no permitida: ${forbidden}`,
      });
    }
  }
  for (const [fragment, expected] of Object.entries(
    expectation.exact_occurrences ?? {},
  )) {
    const actual = contarFragmento(
      normalizarSql(quitarLiteralesYComentarios(sql)).toLowerCase(),
      normalizarSql(fragment).toLowerCase(),
    );
    if (actual !== expected) {
      violations.push({
        code: "SQL_OCCURRENCE_MISMATCH",
        message: `El fragmento ${fragment} aparece ${actual} veces; se esperaban ${expected}.`,
      });
    }
  }

  const sanitized = quitarLiteralesYComentarios(sql);
  const metrics = {
    selects: contarKeyword(sanitized, "SELECT"),
    ctes: contarCtes(sanitized),
    subqueries: (sanitized.match(/\(\s*SELECT\b/gi) ?? []).length,
    cases: contarKeyword(sanitized, "CASE"),
    casts: (sanitized.match(/\b(?:SAFE_)?CAST\s*\(/gi) ?? []).length,
    synthetic_layers: (
      normalizarSql(quitarComentariosYStrings(sql)).match(
        /\b(?:fuente|filtro|proyeccion)_\d+\b/gi,
      ) ?? []
    ).length,
  };
  if (
    expectation.min_selects !== undefined &&
    metrics.selects < expectation.min_selects
  ) {
    violations.push({
      code: "SQL_SELECT_COUNT_TOO_LOW",
      message: `La salida tiene ${metrics.selects} SELECT; se requieren al menos ${expectation.min_selects}.`,
    });
  }
  if (
    expectation.max_selects !== undefined &&
    metrics.selects > expectation.max_selects
  ) {
    violations.push({
      code: "SQL_SELECT_COUNT_TOO_HIGH",
      message: `La salida tiene ${metrics.selects} SELECT; se permiten como máximo ${expectation.max_selects}.`,
    });
  }
  const limits: Array<{
    key: keyof typeof metrics;
    expected: number | undefined;
    code: string;
    label: string;
  }> = [
    {
      key: "ctes",
      expected: expectation.max_ctes,
      code: "SQL_CTE_COUNT_TOO_HIGH",
      label: "CTE",
    },
    {
      key: "subqueries",
      expected: expectation.max_subqueries,
      code: "SQL_SUBQUERY_COUNT_TOO_HIGH",
      label: "subquery",
    },
    {
      key: "cases",
      expected: expectation.max_cases,
      code: "SQL_CASE_COUNT_TOO_HIGH",
      label: "CASE",
    },
    {
      key: "casts",
      expected: expectation.max_casts,
      code: "SQL_CAST_COUNT_TOO_HIGH",
      label: "CAST",
    },
    {
      key: "synthetic_layers",
      expected: expectation.max_synthetic_layers,
      code: "SQL_SYNTHETIC_LAYER_COUNT_TOO_HIGH",
      label: "capa sintética",
    },
  ];
  for (const limit of limits) {
    if (limit.expected !== undefined && metrics[limit.key] > limit.expected) {
      violations.push({
        code: limit.code,
        message: `La salida tiene ${metrics[limit.key]} ${limit.label}; se permiten como máximo ${limit.expected}.`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    normalized_sql: normalizedSql,
    violations,
    metrics,
  };
}

export function normalizarSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

export function contarFragmento(text: string, fragment: string): number {
  if (!fragment) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - fragment.length) {
    const index = text.indexOf(fragment, offset);
    if (index === -1) break;
    count += 1;
    offset = index + fragment.length;
  }
  return count;
}

export function contarKeyword(sql: string, keyword: string): number {
  return (sql.match(new RegExp(`\\b${keyword}\\b`, "gi")) ?? []).length;
}

export function contarCtes(sql: string): number {
  let count = 0;
  const withPattern = /\bWITH\s+(?:RECURSIVE\s+)?/gi;
  while (true) {
    const withMatch = withPattern.exec(sql);
    if (!withMatch) break;
    let cursor = withMatch.index + withMatch[0].length;
    let head = leerCabezaCte(sql, cursor);
    if (!head) continue;
    count += 1;
    cursor = saltarParentesis(sql, head.openParenthesis);
    while (true) {
      const comma = /^\s*,/.exec(sql.slice(cursor));
      if (!comma) break;
      head = leerCabezaCte(sql, cursor + comma[0].length);
      if (!head) break;
      count += 1;
      cursor = saltarParentesis(sql, head.openParenthesis);
    }
  }
  return count;
}

export function leerCabezaCte(
  sql: string,
  offset: number,
): { openParenthesis: number } | undefined {
  const match = /^\s*(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)\s+AS\s*\(/.exec(
    sql.slice(offset),
  );
  if (!match) return undefined;
  return {
    openParenthesis: offset + match[0].lastIndexOf("("),
  };
}

export function saltarParentesis(sql: string, openParenthesis: number): number {
  let depth = 0;
  for (let index = openParenthesis; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return sql.length;
}

export function quitarLiteralesYComentarios(sql: string): string {
  let output = "";
  let quote: "'" | '"' | "`" | undefined;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (!quote && current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      output += " ";
      continue;
    }
    if (!quote && current === "/" && next === "*") {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      )
        index += 1;
      index += 1;
      output += " ";
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) {
        index += 1;
        output += "  ";
      } else if (current === quote) {
        quote = undefined;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      output += " ";
      continue;
    }
    output += current;
  }
  return output;
}

export function quitarComentariosYStrings(sql: string): string {
  let output = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (!quote && current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      output += " ";
      continue;
    }
    if (!quote && current === "/" && next === "*") {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      )
        index += 1;
      index += 1;
      output += " ";
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) {
        index += 1;
        output += "  ";
      } else if (current === quote) {
        quote = undefined;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      output += " ";
      continue;
    }
    output += current;
  }
  return output;
}

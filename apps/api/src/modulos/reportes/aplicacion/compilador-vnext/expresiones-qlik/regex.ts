import { emitNumericValue, emitValue } from "./core-valores.js";
import { literalInteger } from "./temporal-calendario.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  literalString,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitCountRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(requiredArgument(args[1]), originalName, insensitive),
  );
  return `CASE WHEN ${text} IS NULL THEN NULL ELSE ARRAY_LENGTH(REGEXP_EXTRACT_ALL(${text}, ${pattern})) END`;
}

export function emitExtractRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length === 2)
    fail(
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande registros dentro de LOAD`,
      originalName,
      0,
    );
  arity(originalName, args, 3);
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(requiredArgument(args[1]), originalName, insensitive),
  );
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const fieldNo = `CAST(TRUNC(${emitNumericValue(requiredArgument(args[2]), environment)}) AS INT64)`;
  return `CASE WHEN ${text} IS NULL OR ${fieldNo} IS NULL THEN NULL WHEN ${fieldNo} > 0 THEN ${matches}[SAFE_ORDINAL(${fieldNo})] WHEN ${fieldNo} < 0 THEN ${matches}[SAFE_ORDINAL(ARRAY_LENGTH(${matches}) + ${fieldNo} + 1)] ELSE NULL END`;
}

export function emitIndexRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const patternExpression = requiredArgument(args[1]);

  if (patternExpression.kind !== "string") {
    const occurrence = args[2]
      ? literalDynamicRegexOccurrence(args[2], originalName)
      : 1;
    const dynamicPattern = `CAST(${emitValue(patternExpression, environment)} AS STRING)`;
    const pattern = insensitive
      ? `CONCAT('(?i:', ${dynamicPattern}, ')')`
      : dynamicPattern;
    return `CASE WHEN ${text} IS NULL OR ${dynamicPattern} IS NULL THEN NULL ELSE REGEXP_INSTR(${text}, ${pattern}, 1, ${occurrence}) END`;
  }

  const pattern = quoteString(
    prepararRegexQlik(patternExpression, originalName, insensitive),
  );
  const count = args[2]
    ? `CAST(TRUNC(${emitNumericValue(args[2], environment)}) AS INT64)`
    : "1";
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const fromRight = `ARRAY_LENGTH(${matches}) + ${count} + 1`;
  return `CASE WHEN ${text} IS NULL OR ${count} IS NULL THEN NULL WHEN ${count} > 0 THEN REGEXP_INSTR(${text}, ${pattern}, 1, ${count}) WHEN ${count} < 0 AND ${fromRight} > 0 THEN REGEXP_INSTR(${text}, ${pattern}, 1, ${fromRight}) ELSE 0 END`;
}

function literalDynamicRegexOccurrence(
  expression: ExprQlik,
  originalName: string,
): number {
  let raw: string | undefined;
  if (expression.kind === "number") raw = expression.raw;
  else if (
    expression.kind === "unary" &&
    ["+", "-"].includes(expression.operator) &&
    expression.operand.kind === "number"
  )
    raw = `${expression.operator}${expression.operand.raw}`;

  if (!raw || !/^[+-]?\d+$/.test(raw))
    fail(
      "REGEX_DYNAMIC_PATTERN_OCCURRENCE_LITERAL_REQUIRED",
      `${originalName} con patrón dinámico requiere una ocurrencia entera literal positiva`,
      originalName,
      0,
    );

  const occurrence = Number(raw);
  if (occurrence <= 0)
    fail(
      "REGEX_DYNAMIC_PATTERN_REVERSE_UNSUPPORTED",
      `${originalName} con patrón dinámico solo admite ocurrencias positivas en esta fase`,
      originalName,
      0,
    );
  return occurrence;
}

export function emitMatchRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length < 2)
    fail(
      "FUNCTION_ARITY",
      `${originalName} requiere al menos 2 argumentos y recibió ${args.length}`,
      originalName,
      0,
    );
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const branches = args.slice(1).map((arg, index) => {
    const regex = prepararRegexQlik(arg, originalName, insensitive);
    const exact = quoteString(`^(?:${regex})$`);
    return `WHEN REGEXP_CONTAINS(${text}, ${exact}) THEN ${index + 1}`;
  });
  return `CASE ${branches.join(" ")} ELSE 0 END`;
}

export function prepararRegexQlik(
  expression: ExprQlik,
  originalName: string,
  insensitive: boolean,
): string {
  const perl = literalString(expression, originalName);
  validarRegexPerlCompatibleConRe2(perl, originalName);
  const re2 = convertirCapturasANoCapturantes(perl);
  return insensitive ? `(?i:${re2})` : re2;
}

export function validarRegexPerlCompatibleConRe2(
  pattern: string,
  originalName: string,
): void {
  let escaped = false;
  let characterClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const current = pattern[i] ?? "";
    const next = pattern[i + 1] ?? "";
    if (escaped) {
      if (/^[1-9gkKRCXhHvV]$/.test(current))
        regexPerlUdf(originalName, pattern);
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "[" && !characterClass) {
      characterClass = true;
      continue;
    }
    if (current === "]" && characterClass) {
      characterClass = false;
      continue;
    }
    if (characterClass || current !== "(") continue;
    if (next === "*") regexPerlUdf(originalName, pattern);
    if (next !== "?") continue;
    const tail = pattern.slice(i);
    if (/^\(\?:/.test(tail)) continue;
    if (/^\(\?[imsU-]+(?::|\))/.test(tail)) continue;
    regexPerlUdf(originalName, pattern);
  }
  if (/(?:\*|\+|\?|\{\d+(?:,\d*)?\})\+/.test(pattern))
    regexPerlUdf(originalName, pattern);
}

export function regexPerlUdf(originalName: string, pattern: string): never {
  fail(
    "REGEX_PERL_FEATURE_REQUIRES_UDF",
    `${originalName} usa sintaxis Perl regex que RE2 de BigQuery no representa de forma segura: ${pattern}`,
    originalName,
    0,
  );
}

export function convertirCapturasANoCapturantes(pattern: string): string {
  let output = "";
  let escaped = false;
  let characterClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const current = pattern[i] ?? "";
    if (escaped) {
      output += current;
      escaped = false;
      continue;
    }
    if (current === "\\") {
      output += current;
      escaped = true;
      continue;
    }
    if (current === "[" && !characterClass) characterClass = true;
    else if (current === "]" && characterClass) characterClass = false;
    if (!characterClass && current === "(" && pattern[i + 1] !== "?") {
      output += "(?:";
      continue;
    }
    output += current;
  }
  return output;
}

export function emitReplaceRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const pattern = quoteString(
    prepararRegexQlik(requiredArgument(args[1]), originalName, insensitive),
  );
  const replacement = emitRegexReplacement(
    requiredArgument(args[2]),
    environment,
  );
  if (!args[3] || (args[3].kind === "number" && Number(args[3].raw) === 0))
    return `REGEXP_REPLACE(${text}, ${pattern}, ${replacement})`;

  if (args[3].kind === "number" && /^[+-]?\d+$/.test(args[3].raw)) {
    const literal = Number(args[3].raw);
    const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
    const target =
      literal > 0
        ? String(literal)
        : `ARRAY_LENGTH(${matches}) - ${Math.abs(literal)} + 1`;
    const start = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 0)`;
    const finish = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 1)`;
    return `CASE WHEN ${target} <= 0 OR ${start} = 0 THEN ${text} ELSE CONCAT(SUBSTR(${text}, 1, ${start} - 1), ${replacement}, SUBSTR(${text}, ${finish})) END`;
  }

  const occurrence = `CAST(TRUNC(${emitNumericValue(args[3], environment)}) AS INT64)`;
  const matches = `REGEXP_EXTRACT_ALL(${text}, ${pattern})`;
  const target = `CASE WHEN ${occurrence} > 0 THEN ${occurrence} WHEN ${occurrence} < 0 THEN ARRAY_LENGTH(${matches}) + ${occurrence} + 1 ELSE 0 END`;
  const start = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 0)`;
  const finish = `REGEXP_INSTR(${text}, ${pattern}, 1, ${target}, 1)`;
  return `CASE WHEN ${text} IS NULL OR ${occurrence} IS NULL THEN NULL WHEN ${occurrence} = 0 THEN REGEXP_REPLACE(${text}, ${pattern}, ${replacement}) WHEN ${target} <= 0 OR ${start} = 0 THEN ${text} ELSE CONCAT(SUBSTR(${text}, 1, ${start} - 1), ${replacement}, SUBSTR(${text}, ${finish})) END`;
}

export function emitRegexReplacement(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "string")
    return `CAST(${quoteString(expression.value.replace(/\\/g, "\\\\"))} AS STRING)`;
  const value = `CAST(${emitValue(expression, environment)} AS STRING)`;
  return `REPLACE(${value}, ${quoteString("\\")}, ${quoteString("\\\\")})`;
}

export function emitExtractRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  if (args.length === 3)
    fail(
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande registros dentro de LOAD`,
      originalName,
      0,
    );
  const group = literalInteger(requiredArgument(args[2]), originalName);
  if (group < 0)
    fail(
      "REGEX_NEGATIVE_GROUP_REQUIRES_UDF",
      `${originalName} con group negativo requiere semántica Perl/Qlik exacta`,
      originalName,
      0,
    );
  const rewritten = prepararRegexGrupoQlik(
    requiredArgument(args[1]),
    originalName,
    insensitive,
    group,
  );
  if (!rewritten.exists) return "NULL";
  const text = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const fieldNo = args[3]
    ? `CAST(TRUNC(${emitNumericValue(args[3], environment)}) AS INT64)`
    : "1";
  if (args[3]?.kind === "number" && Number(args[3].raw) < 0) {
    const all = `REGEXP_EXTRACT_ALL(${text}, ${quoteString(rewritten.pattern)})`;
    return `${all}[SAFE_ORDINAL(ARRAY_LENGTH(${all}) + ${fieldNo} + 1)]`;
  }
  if (args[3] && args[3].kind !== "number")
    fail(
      "REGEX_DYNAMIC_NEGATIVE_OCCURRENCE_REQUIRES_UDF",
      `${originalName} requiere distinguir occurrence positivo/negativo en runtime`,
      originalName,
      0,
    );
  return `REGEXP_EXTRACT(${text}, ${quoteString(rewritten.pattern)}, 1, ${fieldNo})`;
}

export function emitIndexRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const group = literalInteger(requiredArgument(args[2]), originalName);
  if (group !== 0)
    fail(
      "REGEX_GROUP_POSITION_REQUIRES_UDF",
      `${originalName} para grupos internos necesita la posición exacta del grupo, no solo del match completo`,
      originalName,
      0,
    );
  const delegated = args[3]
    ? [requiredArgument(args[0]), requiredArgument(args[1]), args[3]]
    : [requiredArgument(args[0]), requiredArgument(args[1])];
  return emitIndexRegEx(insensitive, originalName, delegated, environment);
}

export function emitReplaceRegExGroup(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 4, 5);
  const group = literalInteger(requiredArgument(args[3]), originalName);
  if (group === 0) {
    const delegated = args[4]
      ? [
          requiredArgument(args[0]),
          requiredArgument(args[1]),
          requiredArgument(args[2]),
          args[4],
        ]
      : [
          requiredArgument(args[0]),
          requiredArgument(args[1]),
          requiredArgument(args[2]),
        ];
    return emitReplaceRegEx(insensitive, originalName, delegated, environment);
  }
  prepararRegexQlik(requiredArgument(args[1]), originalName, insensitive);
  fail(
    "REGEX_GROUP_REPLACEMENT_REQUIRES_UDF",
    `${originalName} requiere reemplazar un grupo interno sin alterar el resto del match; GoogleSQL no expone esa posición de forma exacta`,
    originalName,
    0,
  );
}

export function emitIsRegEx(originalName: string, args: ExprQlik[]): never {
  arityRange(originalName, args, 1, 2);
  fail(
    "REGEX_VALIDATION_REQUIRES_UDF",
    `${originalName} valida sintaxis Perl/Qlik; validar solo RE2 produciría falsos negativos`,
    originalName,
    0,
  );
}

export function emitSubFieldRegEx(
  insensitive: boolean,
  originalName: string,
  args: ExprQlik[],
  _environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  prepararRegexQlik(requiredArgument(args[1]), originalName, insensitive);
  if (!args[2])
    fail(
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande filas dentro de LOAD`,
      originalName,
      0,
    );
  fail(
    "REGEX_SPLIT_REQUIRES_UDF",
    `${originalName} requiere split regex exacto; GoogleSQL no expone REGEXP_SPLIT`,
    originalName,
    0,
  );
}

export function prepararRegexGrupoQlik(
  expression: ExprQlik,
  originalName: string,
  insensitive: boolean,
  targetGroup: number,
): { pattern: string; exists: boolean } {
  const perl = literalString(expression, originalName);
  validarRegexPerlCompatibleConRe2(perl, originalName);
  let output = "";
  let escaped = false;
  let characterClass = false;
  let capture = 0;
  for (let i = 0; i < perl.length; i += 1) {
    const current = perl[i] ?? "";
    if (escaped) {
      output += current;
      escaped = false;
      continue;
    }
    if (current === "\\") {
      output += current;
      escaped = true;
      continue;
    }
    if (current === "[" && !characterClass) characterClass = true;
    else if (current === "]" && characterClass) characterClass = false;
    if (!characterClass && current === "(" && perl[i + 1] !== "?") {
      capture += 1;
      output += targetGroup === capture ? "(" : "(?:";
      continue;
    }
    output += current;
  }
  if (targetGroup === 0) output = convertirCapturasANoCapturantes(perl);
  const exists = targetGroup === 0 || targetGroup <= capture;
  return { pattern: insensitive ? `(?i:${output})` : output, exists };
}

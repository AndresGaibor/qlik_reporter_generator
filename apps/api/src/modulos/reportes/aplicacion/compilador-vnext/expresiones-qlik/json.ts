import { emitValue } from "./core-valores.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  literalString,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitJsonSet(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  return `TO_JSON_STRING(${emitJsonSetRaw(originalName, args, environment)})`;
}

export function emitJsonSetRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 3);
  const tokens = jsonPointerLiteral(requiredArgument(args[1]), originalName);
  const sourceText = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const valueText = `CAST(${emitValue(requiredArgument(args[2]), environment)} AS STRING)`;
  const root = `SAFE.PARSE_JSON(${sourceText})`;
  const value = `SAFE.PARSE_JSON(${valueText})`;
  const sourceInvalid = `(${root} IS NULL AND LOWER(TRIM(${sourceText})) != 'null')`;
  const valueInvalid = `(${value} IS NULL AND LOWER(TRIM(${valueText})) != 'null')`;

  if (tokens.length === 0)
    return `CASE WHEN ${sourceInvalid} OR ${valueInvalid} THEN NULL ELSE ${value} END`;

  const numeric = tokens.map((token) => /^(?:0|[1-9]\\d*)$/.test(token));
  if (numeric.some(Boolean) && tokens.length > 1)
    fail(
      "JSON_SET_MIXED_POINTER_REQUIRES_TYPED_LOWERING",
      `${originalName} requiere resolver contenedores array/objeto intermedios para RFC 6901`,
      originalName,
      0,
    );

  if (tokens.length === 1 && numeric[0]) {
    const token = requiredArgument(tokens[0]);
    const arrayPath = quoteString(`$[${token}]`);
    const objectPath = quoteString(`$."${escapeJsonPathKey(token)}"`);
    return `CASE WHEN ${valueInvalid} THEN NULL WHEN JSON_TYPE(${root}) = 'array' THEN JSON_SET(${root}, ${arrayPath}, ${value}) WHEN JSON_TYPE(${root}) = 'object' THEN JSON_SET(${root}, ${objectPath}, ${value}) ELSE NULL END`;
  }

  const fullPath = `$${tokens.map((token) => `."${escapeJsonPathKey(token)}"`).join("")}`;
  const compatibility: string[] = [`JSON_TYPE(${root}) = 'object'`];
  for (let index = 1; index < tokens.length; index += 1) {
    const parentPath = `$${tokens
      .slice(0, index)
      .map((token) => `."${escapeJsonPathKey(token)}"`)
      .join("")}`;
    const parent = `JSON_QUERY(${root}, ${quoteString(parentPath)})`;
    compatibility.push(
      `(${parent} IS NULL OR JSON_TYPE(${parent}) = 'object')`,
    );
  }
  return `CASE WHEN ${valueInvalid} THEN NULL WHEN ${compatibility.join(" AND ")} THEN JSON_SET(${root}, ${quoteString(fullPath)}, ${value}) ELSE NULL END`;
}

export function emitJsonGet(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const json = emitJsonGetRaw(originalName, args, environment);
  return `COALESCE(LAX_STRING(${json}), NULLIF(TO_JSON_STRING(${json}), 'null'))`;
}

export function emitJsonGetRaw(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const pointer = jsonPointerLiteral(requiredArgument(args[1]), originalName);
  let current = `SAFE.PARSE_JSON(CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING))`;
  let pendingObjectPath = "$";
  const flushObjectPath = () => {
    if (pendingObjectPath === "$") return;
    current = `JSON_QUERY(${current}, ${quoteString(pendingObjectPath)})`;
    pendingObjectPath = "$";
  };
  for (const token of pointer) {
    if (!/^(?:0|[1-9]\d*)$/.test(token)) {
      pendingObjectPath += `."${escapeJsonPathKey(token)}"`;
      continue;
    }
    flushObjectPath();
    const objectPath = quoteString(`$."${escapeJsonPathKey(token)}"`);
    const arrayPath = quoteString(`$[${token}]`);
    current = `CASE WHEN JSON_TYPE(${current}) = 'array' THEN JSON_QUERY(${current}, ${arrayPath}) ELSE JSON_QUERY(${current}, ${objectPath}) END`;
  }
  flushObjectPath();
  return current;
}

export function jsonPointerLiteral(
  expression: ExprQlik,
  originalName: string,
): string[] {
  if (expression.kind !== "string")
    fail(
      "JSON_POINTER_DYNAMIC_REQUIRES_UDF",
      `${originalName} requiere RFC 6901 dinámico; el lowering limpio solo admite path literal`,
      originalName,
      0,
    );
  const pointer = expression.value;
  if (pointer === "") return [];
  if (!pointer.startsWith("/"))
    fail(
      "JSON_POINTER_INVALID",
      `${originalName} requiere un JSON Pointer RFC 6901 válido`,
      originalName,
      0,
    );
  return pointer
    .slice(1)
    .split("/")
    .map((token) => {
      let decoded = "";
      for (let i = 0; i < token.length; i += 1) {
        const char = token[i] ?? "";
        if (char !== "~") {
          decoded += char;
          continue;
        }
        const escapeCode = token[i + 1];
        if (escapeCode === "0") decoded += "~";
        else if (escapeCode === "1") decoded += "/";
        else
          fail(
            "JSON_POINTER_INVALID",
            `${originalName} contiene escape RFC 6901 inválido`,
            originalName,
            0,
          );
        i += 1;
      }
      return decoded;
    });
}

export function escapeJsonPathKey(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function emitIsJson(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 2);
  const source = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  const parsed = `SAFE.PARSE_JSON(${source})`;
  if (!args[1])
    return `CASE WHEN ${parsed} IS NULL AND LOWER(TRIM(${source})) != 'null' THEN 0 ELSE -1 END`;
  const type = literalString(args[1], originalName).toLowerCase();
  if (
    !new Set([
      "value",
      "object",
      "array",
      "string",
      "number",
      "boolean",
      "null",
    ]).has(type)
  )
    return "0";
  if (type === "value")
    return `CASE WHEN ${parsed} IS NULL AND LOWER(TRIM(${source})) != 'null' THEN 0 ELSE -1 END`;
  return `CASE WHEN JSON_TYPE(${parsed}) = ${quoteString(type)} THEN -1 ELSE 0 END`;
}

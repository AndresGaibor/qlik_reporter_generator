import { emitTextValue, emitValue } from "./core-valores.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, arityRange, fail, requiredArgument } from "./utilidades.js";

export function emitMid(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = emitTextValue(requiredArgument(args[0]), environment);
  const start = `CAST(${emitValue(requiredArgument(args[1]), environment)} AS INT64)`;
  if (!args[2]) return `SUBSTR(${text}, ${start})`;
  const count = `CAST(${emitValue(args[2], environment)} AS INT64)`;
  return `SUBSTR(${text}, ${start}, ${count})`;
}

export function emitCharFilter(
  kind: "keepchar" | "purgechar",
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const source = emitTextValue(requiredArgument(args[0]), environment);
  const chars = `TO_CODE_POINTS(${emitTextValue(requiredArgument(args[1]), environment)})`;
  const predicate = kind === "keepchar" ? "IN" : "NOT IN";
  return `CASE WHEN ${source} IS NULL THEN NULL ELSE COALESCE((SELECT CODE_POINTS_TO_STRING(ARRAY_AGG(cp ORDER BY pos)) FROM UNNEST(TO_CODE_POINTS(${source})) AS cp WITH OFFSET AS pos WHERE cp ${predicate} UNNEST(${chars})), '') END`;
}

export function emitIndex(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = emitTextValue(requiredArgument(args[0]), environment);
  const substring = emitTextValue(requiredArgument(args[1]), environment);
  const count = args[2]
    ? `CAST(${emitValue(args[2], environment)} AS INT64)`
    : "1";
  return `CASE WHEN ${count} IS NULL THEN NULL WHEN ${count} = 0 THEN 0 WHEN ${count} > 0 THEN INSTR(${text}, ${substring}, 1, ${count}) ELSE INSTR(${text}, ${substring}, -1, ABS(${count})) END`;
}

export function emitFindOneOf(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 2, 3);
  const text = emitTextValue(requiredArgument(args[0]), environment);
  const charSet = emitTextValue(requiredArgument(args[1]), environment);
  const count = args[2]
    ? `CAST(${emitValue(args[2], environment)} AS INT64)`
    : "1";
  const positions = `ARRAY(SELECT pos FROM UNNEST(GENERATE_ARRAY(1, LENGTH(${text}))) AS pos WHERE TO_CODE_POINTS(SUBSTR(${text}, pos, 1))[SAFE_OFFSET(0)] IN UNNEST(TO_CODE_POINTS(${charSet})) ORDER BY pos)`;
  return `CASE WHEN ${text} IS NULL OR ${charSet} IS NULL THEN NULL WHEN ${count} <= 0 THEN 0 ELSE COALESCE(${positions}[SAFE_ORDINAL(${count})], 0) END`;
}

export function emitTextBetween(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 3, 4);
  const text = emitTextValue(requiredArgument(args[0]), environment);
  const before = emitTextValue(requiredArgument(args[1]), environment);
  const after = emitTextValue(requiredArgument(args[2]), environment);
  const occurrence = args[3]
    ? `CAST(${emitValue(args[3], environment)} AS INT64)`
    : "1";
  const start = `INSTR(${text}, ${before}, 1, ${occurrence})`;
  const contentStart = `(${start} + LENGTH(${before}))`;
  const finish = `INSTR(${text}, ${after}, ${contentStart}, 1)`;
  return `CASE WHEN ${occurrence} IS NULL OR ${occurrence} <= 0 OR ${start} = 0 OR ${finish} = 0 THEN NULL ELSE SUBSTR(${text}, ${contentStart}, ${finish} - ${contentStart}) END`;
}

export function emitSubStringCount(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arity(originalName, args, 2);
  const text = emitTextValue(requiredArgument(args[0]), environment);
  const substring = emitTextValue(requiredArgument(args[1]), environment);
  const lastStart = `LENGTH(${text}) - LENGTH(${substring}) + 1`;
  return `CASE WHEN ${text} IS NULL OR ${substring} IS NULL THEN NULL WHEN LENGTH(${substring}) = 0 THEN 0 ELSE (SELECT COUNTIF(SUBSTR(${text}, pos, LENGTH(${substring})) = ${substring}) FROM UNNEST(GENERATE_ARRAY(1, GREATEST(0, ${lastStart}))) AS pos) END`;
}

export function emitMatch(
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
  const target = emitTextValue(requiredArgument(args[0]), environment);
  const branches = args
    .slice(1)
    .map(
      (arg, index) =>
        `WHEN ${target} = ${emitTextValue(arg, environment)} THEN ${index + 1}`,
    )
    .join(" ");
  return `CASE ${branches} ELSE 0 END`;
}

export function emitSubField(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  if (args.length === 2)
    fail(
      "SUBFIELD_EXPANDING_REQUIRES_RELATIONAL_LOWERING",
      `${originalName} sin field_no expande filas y debe compilarse como operación relacional`,
      originalName,
      0,
    );
  arity(originalName, args, 3);
  const text = `COALESCE(${emitTextValue(requiredArgument(args[0]), environment)}, '')`;
  const delimiter = emitTextValue(requiredArgument(args[1]), environment);
  const fieldNo = `CAST(${emitValue(requiredArgument(args[2]), environment)} AS INT64)`;
  const parts = `SPLIT(${text}, ${delimiter})`;
  return `CASE WHEN ${fieldNo} > 0 THEN ${parts}[SAFE_ORDINAL(${fieldNo})] WHEN ${fieldNo} < 0 THEN ${parts}[SAFE_ORDINAL(ARRAY_LENGTH(${parts}) + ${fieldNo} + 1)] ELSE NULL END`;
}

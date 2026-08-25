import { translateQlikNumberFormat } from "./conversiones.js";
import {
  emitNumericArgument,
  emitNumericValue,
  emitValue,
} from "./core-valores.js";
import { contieneFuncionDual } from "./dual.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import {
  arityRange,
  literalString,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitNum(
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 4);
  const input = requiredArgument(args[0]);
  const number =
    contieneFuncionDual(input) ||
    (input.kind === "identifier" &&
      Boolean(environment.dualComponents?.[input.name]))
      ? emitNumericValue(input, environment)
      : emitNumericArgument(input, environment);
  if (!args[1]) {
    let result = `CAST(${number} AS STRING)`;
    const decimalSep = environment.decimalSep ?? ".";
    if (decimalSep !== ".")
      result = `REPLACE(${result}, '.', ${quoteString(decimalSep)})`;
    return result;
  }
  const format = literalString(args[1], originalName);
  const bigQueryFormat = translateQlikNumberFormat(format, originalName);
  let result = `CAST(${number} AS STRING FORMAT ${quoteString(bigQueryFormat)})`;
  const decimalSep = args[2]
    ? literalString(args[2], originalName)
    : (environment.decimalSep ?? ".");
  const thousandSep = args[3]
    ? literalString(args[3], originalName)
    : (environment.thousandSep ?? ",");
  if (decimalSep !== "." || thousandSep !== ",") {
    result = `REPLACE(REPLACE(REPLACE(${result}, ',', '{QLIK_THOUSAND}'), '.', ${quoteString(decimalSep)}), '{QLIK_THOUSAND}', ${quoteString(thousandSep)})`;
  }
  return result;
}

export function emitRounding(
  kind: string,
  originalName: string,
  args: ExprQlik[],
  environment: EntornoExpresionQlik,
): string {
  arityRange(originalName, args, 1, 3);
  const x = emitValue(requiredArgument(args[0]), environment);
  if (args.length === 1 && kind === "floor") return `FLOOR(${x})`;
  if (args.length === 1 && kind === "ceil") return `CEIL(${x})`;
  const step = args[1] ? emitValue(args[1], environment) : "1";
  const offset = args[2] ? emitValue(args[2], environment) : "0";
  const normalized = `((${x}) - (${offset})) / (${step})`;
  if (kind === "round")
    return `(FLOOR(${normalized} + 0.5) * (${step}) + (${offset}))`;
  if (kind === "floor")
    return `(FLOOR(${normalized}) * (${step}) + (${offset}))`;
  return `(CEIL(${normalized}) * (${step}) + (${offset}))`;
}

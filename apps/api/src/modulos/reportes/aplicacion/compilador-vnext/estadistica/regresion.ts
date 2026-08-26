import type { ExprQlik } from "../expresiones-qlik.js";
import type { ContextoEstadistica } from "./tipos.js";
import { requireArityRange, requiredArgument } from "./validacion.js";

export function emitLinest(
  name: string,
  metric: string,
  args: ExprQlik[],
  context: ContextoEstadistica,
): string {
  requireArityRange(name, args, 2, 4, context);
  if (args.length === 3)
    context.fail(
      "STATISTICS_CONSTRAINT_PAIR_REQUIRED",
      `${name} requiere y0 y x0 juntos para fijar la recta`,
    );
  const yRaw = context.emitNumeric(requiredArgument(args, 0, context));
  const xRaw = context.emitNumeric(requiredArgument(args, 1, context));
  const constrained = args.length === 4;
  const y0 = constrained
    ? context.emitNumeric(requiredArgument(args, 2, context))
    : "0";
  const x0 = constrained
    ? context.emitNumeric(requiredArgument(args, 3, context))
    : "0";
  const y = constrained ? `(${yRaw} - ${y0})` : yRaw;
  const x = constrained ? `(${xRaw} - ${x0})` : xRaw;
  const pairs = `UNNEST(ARRAY_AGG(IF(${yRaw} IS NOT NULL AND ${xRaw} IS NOT NULL, STRUCT(${y} AS y, ${x} AS x), NULL) IGNORE NULLS)) AS pair`;
  const n = "COUNT(*)";
  const ssx = constrained
    ? "SUM(POW(pair.x, 2))"
    : "(COUNT(*) - 1) * VAR_SAMP(pair.x)";
  const slope = constrained
    ? "SAFE_DIVIDE(SUM(pair.x * pair.y), SUM(POW(pair.x, 2)))"
    : "SAFE_DIVIDE(COVAR_SAMP(pair.y, pair.x), VAR_SAMP(pair.x))";
  const intercept = constrained
    ? `${y0} - (${slope}) * ${x0}`
    : `AVG(pair.y) - (${slope}) * AVG(pair.x)`;
  const ssreg = `(${slope}) * (${slope}) * (${ssx})`;
  const ssresid = constrained
    ? "SUM(POW(pair.y, 2)) - SAFE_DIVIDE(POW(SUM(pair.x * pair.y), 2), SUM(POW(pair.x, 2)))"
    : `(${n} - 1) * VAR_SAMP(pair.y) - (${ssreg})`;
  const df = constrained ? "COUNT(*) - 1" : "COUNT(*) - 2";
  const sey = `SQRT(SAFE_DIVIDE(${ssresid}, ${df}))`;
  const sem = `SQRT(SAFE_DIVIDE(${ssresid}, ${df}) / (${ssx}))`;
  const seb = constrained
    ? `ABS(${x0}) * (${sem})`
    : `(${sey}) * SQRT(SAFE_DIVIDE(1, ${n}) + SAFE_DIVIDE(POW(AVG(pair.x), 2), ${ssx}))`;
  const source = "(SELECT ";
  const from = ` FROM ${pairs})`;
  switch (metric) {
    case "m":
      return `${source}${slope}${from}`;
    case "b":
      return `${source}${intercept}${from}`;
    case "df":
      return `${source}CASE WHEN COUNT(*) < ${constrained ? 2 : 3} THEN NULL ELSE ${df} END${from}`;
    case "f":
      return `${source}SAFE_DIVIDE(POW(CORR(pair.y, pair.x), 2), 1 - POW(CORR(pair.y, pair.x), 2))${from}`;
    case "r2":
      return `${source}POW(CORR(pair.y, pair.x), 2)${from}`;
    case "seb":
      return `${source}${seb}${from}`;
    case "sem":
      return `${source}${sem}${from}`;
    case "sey":
      return `${source}${sey}${from}`;
    case "ssreg":
      return `${source}${ssreg}${from}`;
    case "ssresid":
      return `${source}${ssresid}${from}`;
    default:
      return context.fail(
        "STATISTICS_IMPLEMENTATION_MISSING",
        `${name} no tiene métrica LINEST reconocida`,
      );
  }
}

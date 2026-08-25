import { parsearExpresionQlik } from "./parser.js";
import type { ExprQlik } from "./tipos.js";

export const DUAL_FUNCTIONS = new Set([
  "date",
  "month",
  "monthstart",
  "monthend",
  "quarterstart",
  "quarterend",
  "yearstart",
  "yearend",
  "daystart",
  "dayend",
  "weekday",
  "makedate",
  "maketime",
  "addyears",
  "addmonths",
  "num",
  "jsonget",
  "jsonset",
  "applymap",
  "monthname",
  "quartername",
  "weekname",
  "weekstart",
  "weekend",
  "yearname",
  "makeweekdate",
  "monthsstart",
  "monthsend",
  "firstworkdate",
  "lastworkdate",
  "setdateyearmonth",
  "now",
  "today",
  "gmt",
  "utc",
  "timezone",
  "localtime",
  "converttolocaltime",
  "date#",
  "interval#",
  "money#",
  "num#",
  "time#",
  "timestamp#",
  "dual",
  "interval",
  "money",
  "time",
  "timestamp",
  "class",
  "rgb",
  "argb",
  "hsl",
  "firstsortedvalue",
  "firstvalue",
  "lastvalue",
  "maxstring",
  "minstring",
  "rangemaxstring",
  "rangeminstring",
  "rangeonly",
  "rangemode",
  "rangenpv",
  "rangeirr",
  "rangexnpv",
  "rangexirr",
  "npv",
  "irr",
  "xnpv",
  "xirr",
  "fv",
  "nper",
  "pmt",
  "pv",
  "rate",
  "blackandschole",
]);

export const ADVANCED_TEMPORAL_FUNCTIONS = new Set([
  "age",
  "daynumberofyear",
  "daynumberofquarter",
  "monthname",
  "quartername",
  "weekname",
  "weekstart",
  "weekend",
  "yearname",
  "makeweekdate",
  "monthsstart",
  "monthsend",
  "inday",
  "inmonths",
  "inyeartodate",
  "networkdays",
  "firstworkdate",
  "lastworkdate",
  "setdateyearmonth",
  "now",
  "today",
  "gmt",
  "utc",
  "timezone",
  "localtime",
  "converttolocaltime",
]);

export function esExpresionDualQlik(expression: string): boolean {
  return contieneFuncionDual(parsearExpresionQlik(expression));
}

export function contieneApplyMapQlik(expression: ExprQlik): boolean {
  switch (expression.kind) {
    case "call":
      return (
        expression.name.toLowerCase() === "applymap" ||
        expression.args.some(contieneApplyMapQlik)
      );
    case "unary":
      return contieneApplyMapQlik(expression.operand);
    case "binary":
      return (
        contieneApplyMapQlik(expression.left) ||
        contieneApplyMapQlik(expression.right)
      );
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return false;
  }
}

export function esApplyMapDirectoQlik(expression: ExprQlik): boolean {
  return (
    expression.kind === "call" && expression.name.toLowerCase() === "applymap"
  );
}

export function serializarExpresionQlik(expression: ExprQlik): string {
  return JSON.stringify(expression);
}

export function contieneFuncionDual(expression: ExprQlik): boolean {
  switch (expression.kind) {
    case "call":
      return (
        DUAL_FUNCTIONS.has(expression.name.toLowerCase()) ||
        expression.args.some(contieneFuncionDual)
      );
    case "unary":
      return contieneFuncionDual(expression.operand);
    case "binary":
      return (
        contieneFuncionDual(expression.left) ||
        contieneFuncionDual(expression.right)
      );
    case "number":
    case "string":
    case "identifier":
    case "variable":
    case "wildcard":
      return false;
  }
}

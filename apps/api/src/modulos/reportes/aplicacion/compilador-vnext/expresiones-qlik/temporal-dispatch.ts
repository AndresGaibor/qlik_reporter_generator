import { qlikSerialFromTimestamp } from "./numericas.js";
import {
  emitClockTimestamp,
  emitInDay,
  emitInMonths,
  emitInYearToDate,
  emitNetworkDays,
  emitSetDateYearMonth,
  emitSetDateYearMonthRaw,
  emitToday,
  emitUnsupportedTemporalRuntimeContext,
  emitWorkDate,
  emitWorkDateRaw,
  requireCurrentClockMode,
} from "./temporal-condiciones.js";
import {
  emitAge,
  emitDayNumber,
  emitMakeWeekDate,
  emitMakeWeekDateRaw,
  emitMonthName,
  emitMonthNameStart,
  emitMonthsBoundary,
  emitMonthsEndTimestamp,
  emitMonthsStart,
  emitQuarterName,
  emitQuarterNameStart,
  emitWeekBoundary,
  emitWeekEndTimestamp,
  emitWeekName,
  emitWeekNameStart,
  emitWeekStart,
  emitYearName,
  emitYearNameStart,
} from "./temporal-nombres.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, arityRange, fail, quoteString } from "./utilidades.js";

export function emitAdvancedTemporal(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const name = expression.name.toLowerCase();
  const args = expression.args;
  if (name === "age") return emitAge(expression.name, args, environment);
  if (name === "daynumberofyear" || name === "daynumberofquarter")
    return emitDayNumber(name, expression.name, args, environment);
  if (name === "monthname")
    return emitMonthName(expression.name, args, environment);
  if (name === "quartername")
    return emitQuarterName(expression.name, args, environment);
  if (name === "weekname")
    return emitWeekName(expression.name, args, environment);
  if (name === "yearname")
    return emitYearName(expression.name, args, environment);
  if (name === "weekstart" || name === "weekend")
    return emitWeekBoundary(name, expression.name, args, environment);
  if (name === "makeweekdate")
    return emitMakeWeekDate(expression.name, args, environment);
  if (name === "monthsstart" || name === "monthsend")
    return emitMonthsBoundary(name, expression.name, args, environment);
  if (name === "inday") return emitInDay(expression.name, args, environment);
  if (name === "inmonths")
    return emitInMonths(expression.name, args, environment);
  if (name === "inyeartodate")
    return emitInYearToDate(expression.name, args, environment);
  if (name === "networkdays")
    return emitNetworkDays(expression.name, args, environment);
  if (name === "firstworkdate" || name === "lastworkdate")
    return emitWorkDate(name, expression.name, args, environment);
  if (name === "setdateyearmonth")
    return emitSetDateYearMonth(expression.name, args, environment);
  if (name === "now" || name === "gmt" || name === "utc")
    return emitClockTimestamp(name, expression.name, args, environment);
  if (name === "today") return emitToday(expression.name, args, environment);
  if (name === "timezone") {
    arity(expression.name, args, 0);
    return quoteString("UTC");
  }
  if (name === "localtime" || name === "converttolocaltime")
    return emitUnsupportedTemporalRuntimeContext(expression.name, args, name);
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} figura como temporal avanzada pero no tiene lowering`,
    expression.name,
    0,
  );
}

export function emitAdvancedTemporalNumeric(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const name = expression.name.toLowerCase();
  const args = expression.args;
  if (name === "age") return emitAge(expression.name, args, environment);
  if (name === "daynumberofyear" || name === "daynumberofquarter")
    return emitDayNumber(name, expression.name, args, environment);
  if (name === "inday") return emitInDay(expression.name, args, environment);
  if (name === "inmonths")
    return emitInMonths(expression.name, args, environment);
  if (name === "inyeartodate")
    return emitInYearToDate(expression.name, args, environment);
  if (name === "networkdays")
    return emitNetworkDays(expression.name, args, environment);
  if (name === "timezone") {
    arity(expression.name, args, 0);
    return "0";
  }
  if (["monthname", "quartername", "weekname", "yearname"].includes(name))
    return qlikSerialFromTimestamp(
      `TIMESTAMP(${
        name === "monthname"
          ? emitMonthNameStart(expression.name, args, environment)
          : name === "quartername"
            ? emitQuarterNameStart(expression.name, args, environment)
            : name === "weekname"
              ? emitWeekNameStart(expression.name, args, environment)
              : emitYearNameStart(expression.name, args, environment)
      })`,
    );
  if (name === "weekstart")
    return qlikSerialFromTimestamp(
      `TIMESTAMP(${emitWeekStart(expression.name, args, environment)})`,
    );
  if (name === "weekend")
    return qlikSerialFromTimestamp(
      emitWeekEndTimestamp(expression.name, args, environment),
    );
  if (name === "makeweekdate")
    return qlikSerialFromTimestamp(
      `TIMESTAMP(${emitMakeWeekDateRaw(expression.name, args, environment)})`,
    );
  if (name === "monthsstart" || name === "monthsend")
    return qlikSerialFromTimestamp(
      name === "monthsstart"
        ? `TIMESTAMP(${emitMonthsStart(expression.name, args, environment)})`
        : emitMonthsEndTimestamp(expression.name, args, environment),
    );
  if (name === "firstworkdate" || name === "lastworkdate")
    return qlikSerialFromTimestamp(
      `TIMESTAMP(${emitWorkDateRaw(name, expression.name, args, environment)})`,
    );
  if (name === "setdateyearmonth")
    return qlikSerialFromTimestamp(
      emitSetDateYearMonthRaw(expression.name, args, environment),
    );
  if (name === "now" || name === "gmt" || name === "utc") {
    arityRange(expression.name, args, 0, 1);
    if (args[0]) requireCurrentClockMode(args[0], expression.name);
    return qlikSerialFromTimestamp("CURRENT_TIMESTAMP()");
  }
  if (name === "today") {
    arityRange(expression.name, args, 0, 1);
    if (args[0]) requireCurrentClockMode(args[0], expression.name);
    return qlikSerialFromTimestamp("TIMESTAMP(CURRENT_DATE('UTC'))");
  }
  if (name === "localtime" || name === "converttolocaltime")
    return emitUnsupportedTemporalRuntimeContext(expression.name, args, name);
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} figura como temporal avanzada pero no tiene componente numérico`,
    expression.name,
    0,
  );
}

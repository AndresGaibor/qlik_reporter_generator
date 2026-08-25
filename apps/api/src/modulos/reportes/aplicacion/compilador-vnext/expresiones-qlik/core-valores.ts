import { emitirAgregadoFinanciero } from "../agregados-financieros.js";
import {
  emitClassNumeric,
  emitConditionalNumeric,
  emitInterpretationNumeric,
} from "./condicionales.js";
import { qlikDateFromAny } from "./conversiones.js";
import { emitCall } from "./dispatcher.js";
import { ADVANCED_TEMPORAL_FUNCTIONS } from "./dual.js";
import { emitJsonGetRaw, emitJsonSetRaw } from "./json.js";
import {
  qlikNumeric,
  qlikNumericOrTemporal,
  qlikSerialFromTimestamp,
} from "./numericas.js";
import {
  emitApplyMap,
  emitBinary,
  emitCondition,
  emitUnary,
} from "./operadores.js";
import {
  emitDayBoundaryTimestamp,
  emitPeriodBoundaryTimestamp,
  weekDayParts,
} from "./temporal-calendario.js";
import { emitAdvancedTemporalNumeric } from "./temporal-dispatch.js";
import { emitDualDateRaw, emitMakeTimeRaw } from "./temporal-formato.js";
import {
  qlikDateFromTyped,
  qlikTimestampFromTyped,
} from "./temporal-tipado.js";
import {
  esTipoNumericoBigQuery,
  esTipoTemporalBigQuery,
  esTipoTextoBigQuery,
  tipoCampoBigQuery,
} from "./tipado-campos.js";
import type {
  ContextoExpresion,
  EntornoExpresionQlik,
  ExprQlik,
} from "./tipos.js";
import {
  arity,
  arityRange,
  fail,
  parenthesize,
  qualifiedIdentifier,
  quoteString,
  requiredArgument,
} from "./utilidades.js";

export function emitirExpresionBigQuery(
  expression: ExprQlik,
  context: ContextoExpresion = "value",
  environment: EntornoExpresionQlik = {},
): string {
  if (context === "condition") return emitCondition(expression, environment);
  if (context === "numeric") return emitNumericValue(expression, environment);
  if (context === "numeric_component")
    return emitNumericComponent(expression, environment);
  if (context === "text") return emitTextValue(expression, environment);
  return emitValue(expression, environment);
}

export function emitNumericComponent(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.numericField, environment);
    const identifier = qualifiedIdentifier(expression.name, environment);
    const fieldType = tipoCampoBigQuery(expression.name, environment);
    if (esTipoNumericoBigQuery(fieldType)) return identifier;
    if (esTipoTemporalBigQuery(fieldType))
      return qlikSerialFromTimestamp(
        qlikTimestampFromTyped(expression, identifier, environment),
      );
    return qlikNumeric(identifier);
  }
  if (expression.kind === "call" && expression.name.toLowerCase() === "null")
    return "NULL";
  if (
    expression.kind === "call" &&
    expression.name.toLowerCase() === "applymap"
  )
    return emitApplyMap(expression, environment, "numeric_component");
  return emitNumericValue(expression, environment);
}

export function emitTextValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.textField, environment);
    if (esTipoTextoBigQuery(tipoCampoBigQuery(expression.name, environment)))
      return qualifiedIdentifier(expression.name, environment);
  }
  if (
    expression.kind === "call" &&
    expression.name.toLowerCase() === "applymap"
  )
    return emitApplyMap(expression, environment, "text");
  if (expression.kind === "string") return quoteString(expression.value);
  if (expression.kind === "call" && expression.name.toLowerCase() === "null")
    return emitValue(expression, environment);
  return `CAST(${emitValue(expression, environment)} AS STRING)`;
}

export function emitValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  switch (expression.kind) {
    case "number":
      return expression.raw;
    case "string":
      return quoteString(expression.value);
    case "identifier":
      return qualifiedIdentifier(expression.name, environment);
    case "variable":
      return fail(
        "VARIABLE_UNRESOLVED",
        `Variable $(${expression.name}) no resuelta`,
        expression.name,
        0,
      );
    case "wildcard":
      return fail(
        "WILDCARD_OUTSIDE_AGGREGATION",
        "* solo puede emitirse en un contexto que lo admita",
        "*",
        0,
      );
    case "call":
      return emitCall(expression, environment);
    case "unary":
      return emitUnary(expression, environment);
    case "binary":
      return emitBinary(expression, environment);
  }
}

export function emitNumericValue(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "number") return expression.raw;
  if (expression.kind === "identifier") {
    const dual = environment.dualComponents?.[expression.name];
    if (dual) return qualifiedIdentifier(dual.numericField, environment);
    const identifier = qualifiedIdentifier(expression.name, environment);
    const fieldType = tipoCampoBigQuery(expression.name, environment);
    if (esTipoNumericoBigQuery(fieldType)) return identifier;
    if (esTipoTemporalBigQuery(fieldType))
      return qlikSerialFromTimestamp(
        qlikTimestampFromTyped(expression, identifier, environment),
      );
    return environment.identifierQualifier
      ? identifier
      : qlikNumericOrTemporal(identifier);
  }
  if (expression.kind === "unary" && ["+", "-"].includes(expression.operator)) {
    const operand = emitNumericValue(expression.operand, environment);
    return `${expression.operator}${parenthesize(operand)}`;
  }
  if (
    expression.kind === "binary" &&
    ["+", "-", "*", "/"].includes(expression.operator)
  ) {
    const left = emitNumericValue(expression.left, environment);
    const right = emitNumericValue(expression.right, environment);
    return `${emitNumericOperand(expression.left, left, expression.operator, "left")} ${expression.operator} ${emitNumericOperand(expression.right, right, expression.operator, "right")}`;
  }
  if (expression.kind === "call") {
    const name = expression.name.toLowerCase();
    if (name === "applymap")
      return emitApplyMap(expression, environment, "numeric");
    if (ADVANCED_TEMPORAL_FUNCTIONS.has(name))
      return emitAdvancedTemporalNumeric(expression, environment);
    if (["alt", "coalesce", "pick", "if"].includes(name))
      return emitConditionalNumeric(name, expression, environment);
    if (name === "class")
      return emitClassNumeric(expression.name, expression.args, environment);
    if (
      ["date#", "interval#", "money#", "num#", "time#", "timestamp#"].includes(
        name,
      )
    )
      return emitInterpretationNumeric(
        name,
        expression.name,
        expression.args,
        environment,
      );
    if (name === "dual") {
      arity(expression.name, expression.args, 2);
      return emitNumericValue(
        requiredArgument(expression.args[1]),
        environment,
      );
    }
    if (name === "text") {
      arity(expression.name, expression.args, 1);
      return "NULL";
    }
    if (
      ["date", "num", "money", "time", "timestamp", "interval"].includes(name)
    ) {
      arityRange(
        expression.name,
        expression.args,
        1,
        name === "num" || name === "money" ? 4 : 2,
      );
      return ["num", "money"].includes(name)
        ? emitNumericArgument(requiredArgument(expression.args[0]), environment)
        : emitNumericValue(requiredArgument(expression.args[0]), environment);
    }
    if (name === "month") {
      arity(expression.name, expression.args, 1);
      const argument = requiredArgument(expression.args[0]);
      return `EXTRACT(MONTH FROM ${qlikDateFromTyped(argument, emitValue(argument, environment), environment)})`;
    }
    if (name === "monthstart") {
      arityRange(expression.name, expression.args, 1, 2);
      const argument = requiredArgument(expression.args[0]);
      const date = qlikDateFromTyped(
        argument,
        emitValue(argument, environment),
        environment,
      );
      const period = expression.args[1]
        ? emitNumericValue(expression.args[1], environment)
        : "0";
      const start = `DATE_ADD(DATE_TRUNC(${date}, MONTH), INTERVAL CAST(${period} AS INT64) MONTH)`;
      return `CAST(DATE_DIFF(${start}, DATE '1899-12-30', DAY) AS BIGNUMERIC)`;
    }
    if (["daystart", "dayend"].includes(name))
      return qlikSerialFromTimestamp(
        emitDayBoundaryTimestamp(
          name,
          expression.name,
          expression.args,
          environment,
        ),
      );
    if (
      [
        "monthend",
        "quarterstart",
        "quarterend",
        "yearstart",
        "yearend",
      ].includes(name)
    )
      return qlikSerialFromTimestamp(
        emitPeriodBoundaryTimestamp(
          name,
          expression.name,
          expression.args,
          environment,
        ),
      );
    if (name === "weekday")
      return weekDayParts(expression.name, expression.args, environment)
        .numeric;
    if (name === "jsonget") {
      arity(expression.name, expression.args, 2);
      return `LAX_FLOAT64(${emitJsonGetRaw(expression.name, expression.args, environment)})`;
    }
    if (name === "jsonset")
      return `LAX_FLOAT64(${emitJsonSetRaw(expression.name, expression.args, environment)})`;
    if (name === "maketime") {
      const time = emitMakeTimeRaw(
        expression.name,
        expression.args,
        environment,
      );
      return `SAFE_DIVIDE(CAST(TIME_DIFF(${time}, TIME '00:00:00', MICROSECOND) AS BIGNUMERIC), 86400000000)`;
    }
    if (["makedate", "addyears", "addmonths"].includes(name)) {
      const date = emitDualDateRaw(
        name,
        expression.name,
        expression.args,
        environment,
      );
      return `CAST(DATE_DIFF(${date}, DATE '1899-12-30', DAY) AS BIGNUMERIC)`;
    }
    const aggregateLowering = emitirAgregadoFinanciero(
      expression,
      environment,
      {
        emitValue: (argument, nestedEnvironment) =>
          emitValue(argument, nestedEnvironment ?? environment),
        emitNumeric: (argument, nestedEnvironment) =>
          emitNumericArgument(argument, nestedEnvironment ?? environment),
        emitNumericComponent: (argument, nestedEnvironment) =>
          emitNumericComponent(argument, nestedEnvironment ?? environment),
        emitText: (argument, nestedEnvironment) =>
          emitTextValue(argument, nestedEnvironment ?? environment),
        fail: (code, message) => fail(code, message, expression.name, 0),
      },
    );
    if (aggregateLowering !== undefined) return aggregateLowering;
  }
  return qlikNumericOrTemporal(emitValue(expression, environment));
}

export function emitNumericOperand(
  expression: ExprQlik,
  sql: string,
  parentOperator: string,
  side: "left" | "right",
): string {
  if (
    expression.kind !== "binary" ||
    !["+", "-", "*", "/"].includes(expression.operator)
  )
    return sql;
  const childPrecedence =
    expression.operator === "*" || expression.operator === "/" ? 2 : 1;
  const parentPrecedence =
    parentOperator === "*" || parentOperator === "/" ? 2 : 1;
  if (
    childPrecedence < parentPrecedence ||
    (side === "right" && childPrecedence === parentPrecedence)
  )
    return `(${sql})`;
  return sql;
}

export function emitNumericArgument(
  expression: ExprQlik,
  environment: EntornoExpresionQlik,
): string {
  if (expression.kind === "identifier") {
    const fieldType = tipoCampoBigQuery(expression.name, environment);
    if (esTipoNumericoBigQuery(fieldType))
      return qualifiedIdentifier(expression.name, environment);
    if (esTipoTemporalBigQuery(fieldType))
      return emitNumericValue(expression, environment);
  }
  if (
    (expression.kind === "binary" &&
      ["+", "-", "*", "/"].includes(expression.operator)) ||
    (expression.kind === "unary" && ["+", "-"].includes(expression.operator))
  )
    return emitNumericValue(expression, environment);
  return qlikNumeric(emitValue(expression, environment));
}

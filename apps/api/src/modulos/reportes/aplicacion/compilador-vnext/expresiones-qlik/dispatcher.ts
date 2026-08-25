import { emitirAgregadoFinanciero } from "../agregados-financieros.js";
import {
  emitirFuncionEstadistica,
  esFuncionEstadistica,
} from "../estadistica.js";
import { emitirGeoespacialQlik } from "../geospatial.js";
import { emitirInterRecordMetadata } from "../inter-record-metadata.js";
import { emitirMapSubstring } from "../mapping-mapsubstring.js";
import { emitirMetadataQlik } from "../metadata.js";
import { obtenerFuncionQlik } from "../registro-funciones.js";
import {
  emitBasicAggregation,
  emitBasicRange,
  emitCounterAggregation,
  emitOnly,
  emitRangeCounter,
} from "./agregaciones.js";
import {
  emitClassValue,
  emitConditionalValue,
  emitInterpretationValue,
} from "./condicionales.js";
import { qlikDateFromAny, qlikTimestampFromAny } from "./conversiones.js";
import {
  emitNumericArgument,
  emitNumericComponent,
  emitTextValue,
  emitValue,
} from "./core-valores.js";
import {
  ADVANCED_TEMPORAL_FUNCTIONS,
  serializarExpresionQlik,
} from "./dual.js";
import {
  emitColor,
  emitCombinatoric,
  emitFormattingValue,
  emitTypePredicate,
} from "./formato-tipos.js";
import { emitIsJson, emitJsonGet, emitJsonSet } from "./json.js";
import {
  emitBitCount,
  emitDiv,
  emitFmod,
  emitFrac,
  emitMod,
  emitParity,
} from "./numericas.js";
import { emitNum, emitRounding } from "./numero-formato.js";
import { emitApplyMap, emitCondition } from "./operadores.js";
import {
  emitCountRegEx,
  emitExtractRegEx,
  emitExtractRegExGroup,
  emitIndexRegEx,
  emitIndexRegExGroup,
  emitIsRegEx,
  emitMatchRegEx,
  emitReplaceRegEx,
  emitReplaceRegExGroup,
  emitSubFieldRegEx,
} from "./regex.js";
import {
  emitDate,
  emitDayBoundary,
  emitMonth,
  emitPeriodBoundary,
  emitQuarter,
  emitWeekDay,
  emitWeekPart,
} from "./temporal-calendario.js";
import { emitMonthStart } from "./temporal-contexto.js";
import { emitAdvancedTemporal } from "./temporal-dispatch.js";
import {
  emitDualDateRaw,
  emitMakeTime,
  formatDualDate,
} from "./temporal-formato.js";
import {
  emitCharFilter,
  emitFindOneOf,
  emitIndex,
  emitMatch,
  emitMid,
  emitSubField,
  emitSubStringCount,
  emitTextBetween,
} from "./texto.js";
import type { EntornoExpresionQlik, ExprQlik } from "./tipos.js";
import { arity, arityRange, fail, requiredArgument } from "./utilidades.js";

export function emitCall(
  expression: Extract<ExprQlik, { kind: "call" }>,
  environment: EntornoExpresionQlik,
): string {
  const registered = obtenerFuncionQlik(expression.name);
  if (!registered)
    fail(
      "FUNCTION_NOT_IN_OFFICIAL_INVENTORY",
      `La función ${expression.name} no existe en el inventario oficial Qlik`,
      expression.name,
      0,
    );

  const name = expression.name.toLowerCase();
  const args = expression.args;

  const metadata = emitirMetadataQlik(name, args, {
    catalog: environment.tableMetadata,
    filePath: environment.filePath,
  });
  if (metadata !== undefined) return metadata;

  const interRecordMetadata = emitirInterRecordMetadata(
    name,
    args,
    environment.tableMetadata,
  );
  if (interRecordMetadata !== undefined) return interRecordMetadata;

  const geospatial = emitirGeoespacialQlik(name, args, {
    emitValue: (argument) => emitValue(argument, environment),
    emitNumeric: (argument) => emitNumericArgument(argument, environment),
  });
  if (geospatial !== undefined) return geospatial;

  if (name === "mapsubstring")
    return emitirMapSubstring(expression, environment, emitValue);

  if (["hash128", "hash160", "hash256"].includes(name))
    fail(
      "FUNCTION_REQUIRES_QLIK_HASH_UDF",
      `${expression.name} usa el hash propietario de Qlik y requiere una UDF exacta verificada`,
      expression.name,
      0,
    );

  if (name === "jsonobject")
    fail(
      "JSON_OBJECT_NULL_SEMANTICS_REQUIRES_TYPED_LOWERING",
      "JsonObject omite pares cuyo valor Qlik es NULL; JSON_OBJECT de BigQuery produciría JSON null",
      expression.name,
      0,
    );
  if (name === "jsonsetex")
    fail(
      "JSON_SET_EX_REQUIRES_TYPED_LOWERING",
      "JsonSetEx codifica valores Qlik y tiene semántica NULL distinta de JSON_SET",
      expression.name,
      0,
    );
  if (name === "jsonarray")
    fail(
      "JSON_ARRAY_REQUIRES_AGGREGATE_LOWERING",
      "JsonArray de Qlik es una agregación con DISTINCT/TOTAL/sort_weight, no un constructor escalar",
      expression.name,
      0,
    );

  if (esFuncionEstadistica(name))
    return emitirFuncionEstadistica(
      expression.name,
      args,
      expression.modifiers ?? [],
      {
        emitValue: (argument) => emitValue(argument, environment),
        emitNumeric: (argument) => emitNumericArgument(argument, environment),
        fail: (code, message) => fail(code, message, expression.name, 0),
      },
    );

  const aggregateLowering = emitirAgregadoFinanciero(expression, environment, {
    emitValue: (argument, nestedEnvironment) =>
      emitValue(argument, nestedEnvironment ?? environment),
    emitNumeric: (argument, nestedEnvironment) =>
      emitNumericArgument(argument, nestedEnvironment ?? environment),
    emitNumericComponent: (argument, nestedEnvironment) =>
      emitNumericComponent(argument, nestedEnvironment ?? environment),
    emitText: (argument, nestedEnvironment) =>
      emitTextValue(argument, nestedEnvironment ?? environment),
    fail: (code, message) => fail(code, message, expression.name, 0),
  });
  if (aggregateLowering !== undefined) return aggregateLowering;

  if (ADVANCED_TEMPORAL_FUNCTIONS.has(name))
    return emitAdvancedTemporal(expression, environment);

  if (name === "if") {
    arityRange(expression.name, args, 2, 3);
    const otherwise = args[2] ? emitValue(args[2], environment) : "NULL";
    return `CASE WHEN ${emitCondition(requiredArgument(args[0]), environment)} THEN ${emitValue(requiredArgument(args[1]), environment)} ELSE ${otherwise} END`;
  }
  if (["alt", "coalesce", "pick"].includes(name))
    return emitConditionalValue(name, expression, environment);
  if (name === "class")
    return emitClassValue(expression.name, args, environment);
  if (
    ["date#", "interval#", "money#", "num#", "time#", "timestamp#"].includes(
      name,
    )
  )
    return emitInterpretationValue(name, expression.name, args, environment);
  if (name === "dual") {
    arity(expression.name, args, 2);
    return emitValue(requiredArgument(args[0]), environment);
  }
  if (name === "text") {
    arity(expression.name, args, 1);
    return `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
  }
  if (["date", "num", "money", "time", "timestamp", "interval"].includes(name))
    return emitFormattingValue(name, expression.name, args, environment);
  if (["rgb", "argb", "hsl"].includes(name))
    return emitColor(expression.name, name, args, environment);
  if (["combin", "fact", "permut"].includes(name))
    return emitCombinatoric(name, expression.name, args, environment);
  if (name === "true") {
    arity(expression.name, args, 0);
    return "-1";
  }
  if (name === "false") {
    arity(expression.name, args, 0);
    return "0";
  }
  if (["isnum", "istext"].includes(name))
    return emitTypePredicate(name, expression.name, args, environment);
  if (["mixmatch", "wildmatch"].includes(name))
    fail(
      "FUNCTION_REQUIRES_QLIK_COLLATION",
      `${expression.name} requiere la collation Qlik exacta, incluida equivalencia Hiragana/Katakana`,
      expression.name,
      0,
    );
  if (name === "applycodepage")
    fail(
      "FUNCTION_REQUIRES_EXACT_CODEPAGE",
      `${expression.name} requiere tablas de codepage Qlik no equivalentes en BigQuery`,
      expression.name,
      0,
    );

  if (
    name === "applymap" &&
    environment.applyMapBindings?.has(serializarExpresionQlik(expression))
  )
    return emitApplyMap(expression, environment, "value");
  if (name === "applymap")
    fail(
      "APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING",
      "ApplyMap requiere MAPPING y representación dual tipada para preservar hit NULL, default y componente numérico",
      expression.name,
      0,
    );

  if (["upper", "lower", "trim", "ltrim", "rtrim"].includes(name)) {
    arity(expression.name, args, 1);
    const fn =
      name === "ltrim"
        ? "LTRIM"
        : name === "rtrim"
          ? "RTRIM"
          : name.toUpperCase();
    return `${fn}(${emitValue(requiredArgument(args[0]), environment)})`;
  }
  if (name === "len") {
    arity(expression.name, args, 1);
    return `LENGTH(${emitValue(requiredArgument(args[0]), environment)})`;
  }
  if (name === "left" || name === "right") {
    arity(expression.name, args, 2);
    return `${name.toUpperCase()}(${emitValue(requiredArgument(args[0]), environment)}, ${emitValue(requiredArgument(args[1]), environment)})`;
  }
  if (name === "replace") {
    arity(expression.name, args, 3);
    return `REPLACE(${args.map((arg) => emitValue(arg, environment)).join(", ")})`;
  }
  if (name === "mid") return emitMid(expression.name, args, environment);
  if (name === "chr") {
    arity(expression.name, args, 1);
    return `CHR(CAST(${emitValue(requiredArgument(args[0]), environment)} AS INT64))`;
  }
  if (name === "ord") {
    arity(expression.name, args, 1);
    const value = `CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING)`;
    return `TO_CODE_POINTS(${value})[SAFE_OFFSET(0)]`;
  }
  if (name === "repeat") {
    arity(expression.name, args, 2);
    return `REPEAT(CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING), CAST(${emitValue(requiredArgument(args[1]), environment)} AS INT64))`;
  }
  if (name === "keepchar" || name === "purgechar")
    return emitCharFilter(name, expression.name, args, environment);
  if (name === "index") return emitIndex(expression.name, args, environment);
  if (name === "findoneof")
    return emitFindOneOf(expression.name, args, environment);
  if (name === "capitalize") {
    arity(expression.name, args, 1);
    return `INITCAP(CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING))`;
  }
  if (name === "levenshteindist") {
    arity(expression.name, args, 2);
    return `EDIT_DISTANCE(CAST(${emitValue(requiredArgument(args[0]), environment)} AS STRING), CAST(${emitValue(requiredArgument(args[1]), environment)} AS STRING))`;
  }
  if (name === "isjson") return emitIsJson(expression.name, args, environment);
  if (name === "jsonget")
    return emitJsonGet(expression.name, args, environment);
  if (name === "jsonset")
    return emitJsonSet(expression.name, args, environment);
  if (name === "textbetween")
    return emitTextBetween(expression.name, args, environment);
  if (name === "substringcount")
    return emitSubStringCount(expression.name, args, environment);
  if (name === "countregex" || name === "countregexi")
    return emitCountRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "extractregex" || name === "extractregexi")
    return emitExtractRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "indexregex" || name === "indexregexi")
    return emitIndexRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "matchregex" || name === "matchregexi")
    return emitMatchRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "replaceregex" || name === "replaceregexi")
    return emitReplaceRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "extractregexgroup" || name === "extractregexgroupi")
    return emitExtractRegExGroup(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "indexregexgroup" || name === "indexregexgroupi")
    return emitIndexRegExGroup(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "subfieldregex" || name === "subfieldregexi")
    return emitSubFieldRegEx(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "replaceregexgroup" || name === "replaceregexgroupi")
    return emitReplaceRegExGroup(
      name.endsWith("i"),
      expression.name,
      args,
      environment,
    );
  if (name === "isregex" || name === "isregexi")
    return emitIsRegEx(expression.name, args);
  if (name === "subfield")
    return emitSubField(expression.name, args, environment);
  if (["e", "pi", "rand"].includes(name)) {
    arity(expression.name, args, 0);
    if (name === "e") return "EXP(1)";
    if (name === "pi") return "ACOS(-1)";
    return "RAND()";
  }
  if (["exp", "log", "log10", "sqr", "sqrt"].includes(name)) {
    arity(expression.name, args, 1);
    const value = emitNumericArgument(requiredArgument(args[0]), environment);
    if (name === "log") return `LN(${value})`;
    if (name === "sqr") return `POW(${value}, 2)`;
    return `${name.toUpperCase()}(${value})`;
  }
  if (name === "pow") {
    arity(expression.name, args, 2);
    return `POW(${emitNumericArgument(requiredArgument(args[0]), environment)}, ${emitNumericArgument(requiredArgument(args[1]), environment)})`;
  }
  if (
    [
      "acos",
      "acosh",
      "asin",
      "asinh",
      "atan",
      "atanh",
      "cos",
      "cosh",
      "sin",
      "sinh",
      "tan",
      "tanh",
    ].includes(name)
  ) {
    arity(expression.name, args, 1);
    return `${name.toUpperCase()}(${emitNumericArgument(requiredArgument(args[0]), environment)})`;
  }
  if (name === "atan2") {
    arity(expression.name, args, 2);
    return `ATAN2(${emitNumericArgument(requiredArgument(args[0]), environment)}, ${emitNumericArgument(requiredArgument(args[1]), environment)})`;
  }
  if (name === "fabs") {
    arity(expression.name, args, 1);
    return `ABS(${emitValue(requiredArgument(args[0]), environment)})`;
  }
  if (name === "div") return emitDiv(expression.name, args, environment);
  if (name === "mod") return emitMod(expression.name, args, environment);
  if (name === "fmod") return emitFmod(expression.name, args, environment);
  if (name === "frac") return emitFrac(expression.name, args, environment);
  if (name === "even" || name === "odd")
    return emitParity(name, expression.name, args, environment);
  if (name === "bitcount")
    return emitBitCount(expression.name, args, environment);
  if (name === "sign") {
    arity(expression.name, args, 1);
    return `SIGN(${emitNumericArgument(requiredArgument(args[0]), environment)})`;
  }
  if (["year", "day"].includes(name)) {
    arity(expression.name, args, 1);
    const date = qlikDateFromAny(
      emitValue(requiredArgument(args[0]), environment),
    );
    return `EXTRACT(${name.toUpperCase()} FROM ${date})`;
  }
  if (name === "week" || name === "weekyear")
    return emitWeekPart(name, expression.name, args, environment);
  if (["hour", "minute", "second"].includes(name)) {
    arity(expression.name, args, 1);
    return `EXTRACT(${name.toUpperCase()} FROM ${qlikTimestampFromAny(emitValue(requiredArgument(args[0]), environment))})`;
  }
  if (name === "quarter")
    return emitQuarter(expression.name, args, environment);
  if (name === "weekday")
    return emitWeekDay(expression.name, args, environment);
  if (name === "maketime")
    return emitMakeTime(expression.name, args, environment);
  if (name === "date") return emitDate(expression.name, args, environment);
  if (name === "month") return emitMonth(expression.name, args, environment);
  if (name === "monthstart")
    return emitMonthStart(expression.name, args, environment);
  if (["daystart", "dayend"].includes(name))
    return emitDayBoundary(name, expression.name, args, environment);
  if (
    ["monthend", "quarterstart", "quarterend", "yearstart", "yearend"].includes(
      name,
    )
  )
    return emitPeriodBoundary(name, expression.name, args, environment);
  if (["makedate", "addyears", "addmonths"].includes(name)) {
    const date = emitDualDateRaw(name, expression.name, args, environment);
    return formatDualDate(date, environment, expression.name);
  }
  if (name === "num") return emitNum(expression.name, args, environment);
  if (name === "isnull") {
    arity(expression.name, args, 1);
    return `CASE WHEN ${emitValue(requiredArgument(args[0]), environment)} IS NULL THEN -1 ELSE 0 END`;
  }
  if (name === "emptyisnull") {
    arity(expression.name, args, 1);
    const value = emitValue(requiredArgument(args[0]), environment);
    return `CASE WHEN CAST(${value} AS STRING) = '' THEN NULL ELSE ${value} END`;
  }
  if (name === "null") {
    arity(expression.name, args, 0);
    return "NULL";
  }
  if (name === "match") return emitMatch(expression.name, args, environment);
  if (["round", "floor", "ceil"].includes(name))
    return emitRounding(name, expression.name, args, environment);
  if (["sum", "min", "max", "avg", "count"].includes(name))
    return emitBasicAggregation(name, expression, environment);
  if (name === "only") return emitOnly(expression, environment);
  if (["nullcount", "numericcount", "textcount", "missingcount"].includes(name))
    return emitCounterAggregation(name, expression, environment);
  if (["rangesum", "rangeavg", "rangemin", "rangemax"].includes(name))
    return emitBasicRange(name, expression.name, args, environment);
  if (
    [
      "rangecount",
      "rangenullcount",
      "rangenumericcount",
      "rangetextcount",
      "rangemissingcount",
    ].includes(name)
  )
    return emitRangeCounter(name, expression.name, args, environment);
  fail(
    "FUNCTION_IMPLEMENTATION_MISSING",
    `${expression.name} figura como implementada pero no tiene lowering`,
    expression.name,
    0,
  );
}

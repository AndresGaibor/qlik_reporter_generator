import { describe, expect, it } from "bun:test";
import {
  type EntornoExpresionQlik,
  emitirExpresionBigQuery,
  esExpresionDualQlik,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

function compile(expression: string): string {
  return emitirExpresionBigQuery(parsearExpresionQlik(expression));
}

function compileWithEnv(expression: string, environment: EntornoExpresionQlik): string {
  return emitirExpresionBigQuery(parsearExpresionQlik(expression), "value", environment);
}

function compileCondition(expression: string): string {
  return emitirExpresionBigQuery(parsearExpresionQlik(expression), "condition");
}

describe("parser de expresiones Qlik vNext", () => {
  it("respeta precedencia aritmética", () => {
    const ast = parsearExpresionQlik("1 + 2 * 3");
    expect(ast.kind).toBe("binary");
    if (ast.kind !== "binary") throw new Error("AST inesperado");
    expect(ast.operator).toBe("+");
    expect(ast.right).toMatchObject({ kind: "binary", operator: "*" });
  });

  it("respeta precedencia lógica y relacional", () => {
    const ast = parsearExpresionQlik("not [a] = 1 or [b] <> 2 and [c] >= 3");
    expect(ast).toMatchObject({
      kind: "binary",
      operator: "or",
      left: { kind: "unary", operator: "not", operand: { kind: "binary", operator: "=" } },
      right: { kind: "binary", operator: "and" },
    });
    const sql = compileCondition("not [a] = 1 or [b] <> 2 and [c] >= 3");
    expect(sql).toContain("NOT (");
    expect(sql).toContain("`b` != 2");
    expect(sql).toContain("`c` >= 3");
  });

  it("parsea llamadas anidadas y preserva la excepción NULL de &", () => {
    const sql = compile("Upper(Trim([Nombre completo])) & '-' & Year([Fecha])");
    expect(sql).toContain("UPPER(TRIM(`Nombre completo`))");
    expect(sql).toContain("EXTRACT(YEAR FROM COALESCE(");
    expect(sql).toContain("CONCAT(");
    expect(sql).toContain("COALESCE(CAST(");
  });

  it("parsea unary minus, If y la semántica step/offset de Round", () => {
    const rounded = compile("If(IsNull([monto]), 0, Round([monto] * 1.12, 2))");
    expect(rounded).toStartWith("CASE WHEN `monto` IS NULL THEN 0 ELSE");
    expect(rounded).toContain("FLOOR(");
    expect(rounded).toContain("/ (2) + 0.5");

    const flag = compile("If([flag], -1, 0)");
    expect(flag).toContain("SAFE_CAST(CAST(`flag` AS STRING) AS BIGNUMERIC)");
    expect(flag).toContain("!= 0");
    expect(flag).toEndWith("THEN -1 ELSE 0 END");
  });

  it("coerce solo las hojas desconocidas de una aritmética", () => {
    const sql = compile("[monto] * 1.2 * 21");
    const numericLeaf =
      "COALESCE(SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)";

    expect(sql).toStartWith(numericLeaf);
    expect(sql).not.toStartWith(`(${numericLeaf}`);
    expect(sql).toContain(" * 1.2 * 21");
    expect(sql.split(numericLeaf)).toHaveLength(2);
    expect(sql.match(/TIMESTAMP_DIFF\(/g)).toHaveLength(1);
    expect(sql).not.toContain("1.2 AS STRING");
    expect(sql).not.toContain("21 AS STRING");
    expect(compile("1.2 * 21")).toBe("1.2 * 21");
  });

  it("no re-coerce una aritmética al pasarla a una función numérica", () => {
    const sql = compile("Exp([monto] * 1.2)");
    const numericLeaf =
      "COALESCE(SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)";

    expect(sql).toStartWith(`EXP(${numericLeaf}`);
    expect(sql).toContain(" * 1.2)");
    expect(sql.split(numericLeaf)).toHaveLength(2);
    expect(sql).not.toContain("CAST(COALESCE(");
  });

  it("mantiene la coerción en las hojas de los operadores numéricos", () => {
    const sql = compile("Div([monto] * 1.2, 2)");
    const numericLeaf =
      "COALESCE(SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)";

    expect(sql).toContain("TRUNC(SAFE_DIVIDE(");
    expect(sql).toContain(" * 1.2");
    expect(sql.split(numericLeaf)).toHaveLength(2);
    expect(sql).not.toContain("SAFE_CAST(CAST(COALESCE(");
  });

  it("representa dollar expansion como referencia explícita", () => {
    expect(parsearExpresionQlik("$(vLimite) + 1")).toMatchObject({
      kind: "binary",
      left: { kind: "variable", name: "vLimite" },
    });
  });

  it("no confunde comas ni operadores dentro de strings", () => {
    expect(compile("Replace([texto], ',', 'a&b')")).toBe(
      "REPLACE(`texto`, ',', 'a&b')",
    );
  });

  it("traduce el núcleo exacto de strings y números", () => {
    expect(compile("Left([texto], 3)")).toBe("LEFT(`texto`, 3)");
    expect(compile("Right([texto], 2)")).toBe("RIGHT(`texto`, 2)");
    expect(compile("Len([texto])")).toBe("LENGTH(`texto`)");
    expect(compile("Floor([monto])")).toBe("FLOOR(`monto`)");
    expect(compile("Ceil([monto])")).toBe("CEIL(`monto`)");
    expect(compile("Year([fecha])")).toContain("EXTRACT(YEAR FROM COALESCE(");
  });

  it("implementa Mid, Chr, Ord y Repeat con semántica Qlik", () => {
    expect(compile("Mid([texto], 3)")).toBe(
      "SUBSTR(CAST(`texto` AS STRING), CAST(3 AS INT64))",
    );
    expect(compile("Mid([texto], 3, 2)")).toBe(
      "SUBSTR(CAST(`texto` AS STRING), CAST(3 AS INT64), CAST(2 AS INT64))",
    );
    expect(compile("Chr(65)")).toBe("CHR(CAST(65 AS INT64))");
    expect(compile("Ord([texto])")).toContain("TO_CODE_POINTS(CAST(`texto` AS STRING))");
    expect(compile("Repeat([texto], 3)")).toBe(
      "REPEAT(CAST(`texto` AS STRING), CAST(3 AS INT64))",
    );
  });

  it("implementa KeepChar y PurgeChar por code point Unicode", () => {
    expect(compile("KeepChar([texto], 'ABC')")).toContain("CODE_POINTS_TO_STRING");
    expect(compile("KeepChar([texto], 'ABC')")).toContain("IN UNNEST(TO_CODE_POINTS");
    expect(compile("PurgeChar([texto], 'ABC')")).toContain("NOT IN UNNEST(TO_CODE_POINTS");
  });

  it("implementa Index con INSTR, N-ésima ocurrencia y búsqueda inversa", () => {
    expect(compile("Index([texto], 'ab')")).toContain(
      "INSTR(CAST(`texto` AS STRING), CAST('ab' AS STRING), 1, 1)",
    );
    expect(compile("Index([texto], 'ab', 2)")).toContain(
      "INSTR(CAST(`texto` AS STRING), CAST('ab' AS STRING), 1, CAST(2 AS INT64))",
    );
    expect(compile("Index([texto], 'ab', -2)")).toContain(
      "INSTR(CAST(`texto` AS STRING), CAST('ab' AS STRING), -1, ABS(CAST(-2 AS INT64)))",
    );
  });

  it("implementa FindOneOf sobre el conjunto de caracteres Unicode", () => {
    const sql = compile("FindOneOf([texto], 'abc', 2)");
    expect(sql).toContain("TO_CODE_POINTS");
    expect(sql).toContain("SAFE_ORDINAL(CAST(2 AS INT64))");
    expect(sql).toContain("COALESCE(");
  });

  it("implementa Capitalize y LevenshteinDist con funciones nativas", () => {
    expect(compile("Capitalize([texto])")).toBe("INITCAP(CAST(`texto` AS STRING))");
    expect(compile("LevenshteinDist([a], [b])")).toBe(
      "EDIT_DISTANCE(CAST(`a` AS STRING), CAST(`b` AS STRING))",
    );
  });

  it("implementa IsJson con validación de tipo y booleano Qlik -1/0", () => {
    const any = compile("IsJson([texto])");
    expect(any).toContain("SAFE.PARSE_JSON");
    expect(any).toContain("THEN 0 ELSE -1 END");
    const object = compile("IsJson([texto], 'object')");
    expect(object).toContain("JSON_TYPE(");
    expect(object).toContain("= 'object'");
  });

  it("JsonGet usa JSON Pointer literal con SQL limpio para propiedades", () => {
    const sql = compile("JsonGet([json], '/customer/email')");
    expect(sql).toContain("JSON_QUERY(SAFE.PARSE_JSON(CAST(`json` AS STRING)), '$.\"customer\".\"email\"')");
    expect(sql).toContain("LAX_STRING(");
    expect(sql).not.toContain("JSON_TYPE(SAFE.PARSE_JSON");
  });

  it("JsonGet distingue índice de array de clave numérica solo cuando hace falta", () => {
    const sql = compile("JsonGet([json], '/b/0')");
    expect(sql).toContain("JSON_TYPE(");
    expect(sql).toContain("'$[0]'");
    expect(sql).toContain("'$.\"0\"'");
  });

  it("JsonGet decodifica RFC 6901 ~0/~1 y rechaza punteros dinámicos", () => {
    const sql = compile("JsonGet([json], '/a~1b/~0x')");
    expect(sql).toContain('$.\"a/b\".\"~x\"');
    expectCode(
      () => compile("JsonGet([json], [ruta])"),
      "JSON_POINTER_DYNAMIC_REQUIRES_UDF",
    );
    expectCode(
      () => compile("JsonGet([json], 'a/b')"),
      "JSON_POINTER_INVALID",
    );
  });

  it("JsonGet usa el componente numérico dual en aritmética", () => {
    const sql = compile("JsonGet([json], '/price') * 2");
    expect(sql).toContain("LAX_FLOAT64(");
    expect(sql).not.toContain("LAX_STRING(");
  });

  it("JsonSet usa JSON_SET nativo para una propiedad directa válida", () => {
    const sql = compile("JsonSet([json], '/price', '123')");
    expect(sql).toContain("JSON_SET(");
    expect(sql).toContain("'$.\"price\"'");
    expect(sql).toContain("SAFE.PARSE_JSON(CAST('123' AS STRING))");
    expect(sql).toContain("JSON_TYPE(");
  });

  it("JsonSet soporta rutas object-only y valida padres incompatibles", () => {
    const sql = compile("JsonSet([json], '/items/price', '123')");
    expect(sql).toContain("'$.\"items\".\"price\"'");
    expect(sql).toContain("JSON_QUERY(");
    expect(sql).toContain("JSON_TYPE(");
  });

  it("JsonSet distingue raíz array de clave numérica y no adivina rutas mixtas profundas", () => {
    const direct = compile("JsonSet([json], '/0', '\"x\"')");
    expect(direct).toContain("'$[0]'");
    expect(direct).toContain("'$.\"0\"'");
    expectCode(
      () => compile("JsonSet([json], '/items/0/name', '\"x\"')"),
      "JSON_SET_MIXED_POINTER_REQUIRES_TYPED_LOWERING",
    );
  });

  it("JsonSet reemplaza la raíz y rechaza paths/values dinámicos no certificables", () => {
    const root = compile("JsonSet([json], '', '123')");
    expect(root).toContain("ELSE SAFE.PARSE_JSON(CAST('123' AS STRING)) END");
    expect(root).toContain("SAFE.PARSE_JSON(CAST(`json` AS STRING)) IS NULL");
    expectCode(
      () => compile("JsonSet([json], [ruta], '123')"),
      "JSON_POINTER_DYNAMIC_REQUIRES_UDF",
    );
  });

  it("clasifica JsonObject JsonSetEx y JsonArray según su semántica real", () => {
    expectCode(
      () => compile("JsonObject('a', [valor])"),
      "JSON_OBJECT_NULL_SEMANTICS_REQUIRES_TYPED_LOWERING",
    );
    expectCode(
      () => compile("JsonSetEx([json], '/a', [valor])"),
      "JSON_SET_EX_REQUIRES_TYPED_LOWERING",
    );
    expectCode(
      () => compile("JsonArray([valor])"),
      "JSON_ARRAY_REQUIRES_AGGREGATE_LOWERING",
    );
  });

  it("implementa TextBetween con el N-ésimo par de delimitadores", () => {
    const sql = compile("TextBetween([texto], '<', '>', 2)");
    expect(sql).toContain("INSTR(");
    expect(sql).toContain("CAST(2 AS INT64)");
    expect(sql).toContain("SUBSTR(");
    expect(sql).toContain("THEN NULL");
  });

  it("implementa SubStringCount de forma case-sensitive sin regex", () => {
    const sql = compile("SubStringCount([texto], 'ab')");
    expect(sql).toContain("GENERATE_ARRAY");
    expect(sql).toContain("SUBSTR(");
    expect(sql).toContain("= CAST('ab' AS STRING)");
    expect(sql).toContain("COUNTIF");
    expect(sql).not.toContain("REGEXP_");
  });

  it("baja regex Perl compatible a RE2 sin cambiar grupos capturantes", () => {
    const count = compile("CountRegEx([texto], '(ab|cd)+')");
    expect(count).toContain("REGEXP_EXTRACT_ALL");
    expect(count).toContain("(?:ab|cd)+");
    const insensitive = compile("CountRegExI([texto], '[a-z]+')");
    expect(insensitive).toContain("(?i:[a-z]+)");
  });

  it("implementa ExtractRegEx e IndexRegEx con ocurrencias negativas", () => {
    const extract = compile("ExtractRegEx([texto], '([a-z]+)([0-9]+)', -1)");
    expect(extract).toContain("REGEXP_EXTRACT_ALL");
    expect(extract).toContain("ARRAY_LENGTH(");
    const index = compile("IndexRegEx([texto], '[0-9]+', -2)");
    expect(index).toContain("REGEXP_INSTR");
    expect(index).toContain("ARRAY_LENGTH(");
  });

  it("MatchRegEx exige match completo y conserva la variante I", () => {
    const exact = compile("MatchRegEx([texto], '[a-z]+', '[0-9]+')");
    expect(exact).toContain("REGEXP_CONTAINS");
    expect(exact).toContain("^(?:[a-z]+)$");
    const insensitive = compile("MatchRegExI([texto], '[a-z]+')");
    expect(insensitive).toContain("(?i:");
  });

  it("rechaza extensiones Perl que RE2 no puede representar", () => {
    expectCode(
      () => compile("CountRegEx([texto], 'a(?=b)')"),
      "REGEX_PERL_FEATURE_REQUIRES_UDF",
    );
    expectCode(
      () => compile("ExtractRegEx([texto], '(a)\\1', 1)"),
      "REGEX_PERL_FEATURE_REQUIRES_UDF",
    );
  });

  it("ExtractRegEx sin field_no conserva la semántica de expansión de LOAD", () => {
    expectCode(
      () => compile("ExtractRegEx([texto], '[a-z]+')"),
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
    );
  });

  it("mantiene ReplaceRegEx limpio cuando BigQuery tiene equivalencia nativa", () => {
    expect(compile("ReplaceRegEx([texto], '[0-9]', 'x')")).toBe(
      "REGEXP_REPLACE(CAST(`texto` AS STRING), '[0-9]', CAST('x' AS STRING))",
    );
    expect(compile("ReplaceRegExI([texto], '[a-c]', 'x')")).toContain(
      "REGEXP_REPLACE(CAST(`texto` AS STRING), '(?i:[a-c])', CAST('x' AS STRING))",
    );
  });

  it("solo usa lowering extendido de ReplaceRegEx cuando occurrence lo exige", () => {
    const second = compile("ReplaceRegEx([texto], '[0-9]+', 'x', 2)");
    expect(second).toContain("REGEXP_INSTR(");
    expect(second).toContain(", 1, 2, 0)");
    expect(second).toContain(", 1, 2, 1)");
    const last = compile("ReplaceRegEx([texto], '[0-9]+', 'x', -1)");
    expect(last).toContain("ARRAY_LENGTH(REGEXP_EXTRACT_ALL");
  });

  it("extrae un grupo regex compatible sin UDF", () => {
    const first = compile("ExtractRegExGroup([texto], '([a-z]+)([0-9]+)', 1, 2)");
    expect(first).toContain("REGEXP_EXTRACT(");
    expect(first).toContain("([a-z]+)(?:[0-9]+)");
    expect(first).toContain(", 1, CAST(TRUNC(2) AS INT64))");
    const second = compile("ExtractRegExGroupI([texto], '([a-z]+)([0-9]+)', 2, 1)");
    expect(second).toContain("(?i:(?:[a-z]+)([0-9]+))");
  });

  it("usa IndexRegExGroup nativo solo para group 0 y reserva grupos internos a UDF exacta", () => {
    expect(compile("IndexRegExGroup([texto], '([a-z]+)([0-9]+)', 0, 2)")).toContain(
      "REGEXP_INSTR(",
    );
    expectCode(
      () => compile("IndexRegExGroup([texto], '([a-z]+)([0-9]+)', 2, 1)"),
      "REGEX_GROUP_POSITION_REQUIRES_UDF",
    );
  });

  it("ExtractRegExGroup sin field_no conserva expansión de filas de LOAD", () => {
    expectCode(
      () => compile("ExtractRegExGroup([texto], '([a-z]+)([0-9]+)', 1)"),
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
    );
  });

  it("ReplaceRegExGroup usa nativo para group 0 y UDF exacta para grupos internos", () => {
    expect(compile("ReplaceRegExGroup([texto], '([a-z]+)([0-9]+)', 'x', 0)")).toContain(
      "REGEXP_REPLACE(",
    );
    expectCode(
      () => compile("ReplaceRegExGroup([texto], '([a-z]+)([0-9]+)', 'x', 2)"),
      "REGEX_GROUP_REPLACEMENT_REQUIRES_UDF",
    );
  });

  it("IsRegEx se clasifica como validación Perl/Qlik y no como validación RE2", () => {
    expectCode(() => compile("IsRegEx([patron])"), "REGEX_VALIDATION_REQUIRES_UDF");
    expectCode(() => compile("IsRegExI([patron])"), "REGEX_VALIDATION_REQUIRES_UDF");
  });

  it("clasifica SubFieldRegEx como UDF/relacional porque BigQuery no tiene regex split exacto", () => {
    expectCode(
      () => compile("SubFieldRegEx([texto], ' |,|;', 2)"),
      "REGEX_SPLIT_REQUIRES_UDF",
    );
    expectCode(
      () => compile("SubFieldRegEx([texto], ' |,|;')"),
      "REGEX_ROW_EXPANSION_REQUIRES_RELATIONAL_LOWERING",
    );
  });

  it("implementa SubField positivo, negativo y NULL según Qlik", () => {
    expect(compile("SubField([texto], '|', 2)")).toContain("SAFE_ORDINAL(CAST(2 AS INT64))");
    expect(compile("SubField([texto], '|', -1)")).toContain("ARRAY_LENGTH(");
    expect(compile("SubField([texto], '|', 1)")).toContain("COALESCE(CAST(`texto` AS STRING), '')");
    expectCode(
      () => compile("SubField([texto], '|')"),
      "SUBFIELD_EXPANDING_REQUIRES_RELATIONAL_LOWERING",
    );
  });

  it("formatea Date con el DateFormat explícito del script", () => {
    const sql = compileWithEnv("Date([fecha])", { dateFormat: "YYYY-MM-DD" });
    expect(sql).toContain("FORMAT_DATE('%Y-%m-%d'");
    expect(sql).toContain("DATE '1899-12-30'");
  });

  it("detecta duales anidados de forma conservadora", () => {
    expect(esExpresionDualQlik("Date([fecha])")).toBe(true);
    expect(esExpresionDualQlik("If([flag], Date([fecha]), 'N/A')")).toBe(true);
    expect(esExpresionDualQlik("Upper([texto])")).toBe(false);
  });

  it("usa el componente numérico de Date y Num en aritmética", () => {
    const dateMath = compileWithEnv("Date([fecha]) + 1", { dateFormat: "YYYY-MM-DD" });
    expect(dateMath).not.toContain("FORMAT_DATE");
    expect(dateMath).toContain("TIMESTAMP_DIFF(");
    const numMath = compileWithEnv("Num([monto], '#,##0.00') * 2", {});
    expect(numMath).not.toContain("STRING FORMAT");
    expect(numMath).toContain("SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)");
  });

  it("usa el componente numérico de Month pero el texto dual al concatenar", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    } satisfies EntornoExpresionQlik;
    const monthMath = compileWithEnv("Month([fecha]) * 1", environment);
    expect(monthMath).toContain("EXTRACT(MONTH FROM");
    expect(monthMath).not.toContain("WHEN 1 THEN 'Jan'");
    expect(compileWithEnv("Date([fecha]) & '-x'", environment)).toContain(
      "FORMAT_DATE('%Y-%m-%d'",
    );
  });

  it("extrae componentes enteros de fecha/hora desde serial Qlik o timestamp", () => {
    expect(compile("Day([fecha])")).toContain("EXTRACT(DAY FROM");
    expect(compile("Hour([fecha])")).toContain("EXTRACT(HOUR FROM");
    expect(compile("Minute([fecha])")).toContain("EXTRACT(MINUTE FROM");
    expect(compile("Second([fecha])")).toContain("EXTRACT(SECOND FROM");
    const iso = { firstWeekDay: 0, brokenWeeks: 0, referenceDay: 4 };
    expect(compileWithEnv("Week([fecha])", iso)).toContain("EXTRACT(ISOWEEK FROM");
    expect(compileWithEnv("WeekYear([fecha])", iso)).toContain("EXTRACT(ISOYEAR FROM");
  });

  it("no confunde calendarios Week no-ISO con ISO", () => {
    expectCode(() => compile("Week([fecha])"), "WEEK_ENV_REQUIRED");
    expectCode(
      () => compileWithEnv("Week([fecha])", { firstWeekDay: 6, brokenWeeks: 1, referenceDay: 1 }),
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
    );
  });

  it("implementa Quarter estándar y fiscal", () => {
    expect(compile("Quarter([fecha])")).toContain("EXTRACT(QUARTER FROM");
    const fiscal = compile("Quarter([fecha], 4)");
    expect(fiscal).toContain("MOD(EXTRACT(MONTH FROM");
    expect(fiscal).toContain("CAST(4 AS INT64)");
  });

  it("implementa MakeDate, AddYears y AddMonths como duales", () => {
    const environment = { dateFormat: "YYYY-MM-DD" } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("MakeDate(2024, 2, 29)", environment)).toContain(
      "FORMAT_DATE('%Y-%m-%d'",
    );
    expect(compileWithEnv("AddYears([fecha], 2)", environment)).toContain(
      "INTERVAL CAST(TRUNC(2) AS INT64) YEAR",
    );
    const normal = compileWithEnv("AddMonths([fecha], 2)", environment);
    expect(normal).toContain("DATE_ADD(");
    const relativeEnd = compileWithEnv("AddMonths([fecha], 2, 1)", environment);
    expect(relativeEnd).toContain("LAST_DAY(");
    expect(relativeEnd).toContain("EXTRACT(DAY FROM");
    expect(esExpresionDualQlik("AddMonths([fecha], 1)")).toBe(true);
  });

  it("usa el componente serial de duales de fecha nuevos en aritmética", () => {
    const environment = { dateFormat: "YYYY-MM-DD" } satisfies EntornoExpresionQlik;
    const sql = compileWithEnv("AddYears([fecha], 1) + 1", environment);
    expect(sql).toContain("DATE_DIFF(");
    expect(sql).not.toContain("FORMAT_DATE");
  });

  it("implementa MakeTime como dual con defaults mm/ss y TimeFormat", () => {
    const environment = { timeFormat: "h:mm:ss" } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("MakeTime(9)", environment)).toContain(
      "FORMAT('%d:%02d:%02d'",
    );
    expect(compileWithEnv("MakeTime(9, 5, 2)", environment)).toContain(
      "SAFE.PARSE_TIME('%H:%M:%S'",
    );
    expect(esExpresionDualQlik("MakeTime(9, 5)")).toBe(true);
  });

  it("usa la fracción de día de MakeTime en aritmética", () => {
    const sql = compileWithEnv("MakeTime(12, 0, 0) * 2", {
      timeFormat: "hh:mm:ss",
    });
    expect(sql).toContain("TIME_DIFF(");
    expect(sql).toContain("86400000000");
    expect(sql).not.toContain("FORMAT_TIME");
  });

  it("requiere TimeFormat para el texto dual de MakeTime", () => {
    expectCode(() => compile("MakeTime(9)"), "TIME_FORMAT_ENV_REQUIRED");
  });

  it("implementa WeekDay como dual con DayNames y FirstWeekDay", () => {
    const environment = {
      dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      firstWeekDay: 0,
    } satisfies EntornoExpresionQlik;
    const display = compileWithEnv("WeekDay([fecha])", environment);
    expect(display).toContain("WHEN 0 THEN 'Mon'");
    expect(display).toContain("WHEN 6 THEN 'Sun'");
    const numeric = compileWithEnv("WeekDay([fecha]) * 1", environment);
    expect(numeric).toContain("MOD(");
    expect(numeric).not.toContain("THEN 'Mon'");
    expect(esExpresionDualQlik("WeekDay([fecha])")).toBe(true);
  });

  it("preserva el valor visible de Month y MonthStart con entorno explícito", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("Month([fecha])", environment)).toContain("CASE EXTRACT(MONTH FROM");
    expect(compileWithEnv("MonthStart([fecha])", environment)).toContain("DATE_TRUNC(");
  });

  it("implementa Num para los patrones de formato certificados inicialmente", () => {
    const sql = compileWithEnv("Num([monto], '#,##0.00')", {});
    expect(sql).toContain("STRING FORMAT");
    expect(sql).toContain("G");
    expect(sql).toContain("D00");
  });

  it("implementa DayStart y DayEnd con day_start fraccional y último milisegundo", () => {
    const env = { timestampFormat: "M/D/YYYY h:mm:ss[.fff] TT" };
    const start = compileWithEnv("DayStart([ts], -1, 0.5)", env);
    expect(start).toContain("TIMESTAMP_TRUNC(");
    expect(start).toContain("86400000000");
    expect(start).not.toContain("WITH ");

    const end = compileWithEnv("DayEnd([ts], 0, 0.5)", env);
    expect(end).toContain("TIMESTAMP_SUB(");
    expect(end).toContain("INTERVAL 1 MILLISECOND");
    expect(end).toContain("FORMAT(");
  });

  it("usa el serial Qlik de DayEnd en aritmética", () => {
    const sql = compileWithEnv("DayEnd([ts]) - DayStart([ts])", {
      timestampFormat: "YYYY-MM-DD hh:mm:ss",
    });
    expect(sql).toContain("TIMESTAMP_DIFF(");
    expect(sql).toContain("86400000000");
  });

  it("implementa límites de mes/trimestre/año como duales sin CTEs artificiales", () => {
    const monthEnd = compileWithEnv("MonthEnd([fecha], -1)", { dateFormat: "YYYY-MM-DD" });
    expect(monthEnd).toContain("TIMESTAMP_SUB(");
    expect(monthEnd).toContain("INTERVAL 1 MILLISECOND");
    expect(monthEnd).not.toContain("WITH ");

    const quarterStart = compileWithEnv("QuarterStart([fecha], 0, 3)", { dateFormat: "YYYY-MM-DD" });
    expect(quarterStart).toContain("DATE_TRUNC(");
    expect(quarterStart).toContain("QUARTER");
    expect(quarterStart).toContain("INTERVAL 2 MONTH");

    const quarterEnd = compileWithEnv("QuarterEnd([fecha], 1, 3)", { dateFormat: "YYYY-MM-DD" });
    expect(quarterEnd).toContain("TIMESTAMP_SUB(");
    expect(quarterEnd).toContain("INTERVAL 1 MILLISECOND");

    const yearStart = compileWithEnv("YearStart([fecha], -1, 4)", { dateFormat: "YYYY-MM-DD" });
    expect(yearStart).toContain("DATE_TRUNC(");
    expect(yearStart).toContain("YEAR");
    expect(yearStart).toContain("INTERVAL 3 MONTH");

    const yearEnd = compileWithEnv("YearEnd([fecha], 0, 4)", { dateFormat: "YYYY-MM-DD" });
    expect(yearEnd).toContain("TIMESTAMP_SUB(");
    expect(yearEnd).toContain("INTERVAL 1 MILLISECOND");
  });

  it("usa el serial temporal de los límites duales cuando entran en aritmética", () => {
    const sql = compileWithEnv("QuarterEnd([fecha]) + 1", { dateFormat: "YYYY-MM-DD" });
    expect(sql).toContain("TIMESTAMP_DIFF(");
    expect(sql).toContain("86400000000");
    expect(sql).toContain(" + ");
  });

  it("implementa Only de forma exacta sin CTE artificial", () => {
    const sql = compile("Only([id])");
    expect(sql).toContain("COUNT(*) = COUNT(`id`)");
    expect(sql).toContain("COUNT(DISTINCT `id`) = 1");
    expect(sql).toContain("ANY_VALUE(`id`)");
    expect(sql).not.toContain("WITH ");
  });

  it("reserva Mode y FirstSortedValue al lowering relacional exacto", () => {
    expectCode(() => compile("Mode([id])"), "AGGREGATION_REQUIRES_RELATIONAL_LOWERING");
    expectCode(
      () => compile("FirstSortedValue([id], [peso])"),
      "AGGREGATION_REQUIRES_RELATIONAL_LOWERING",
    );
  });

  it("mantiene agregaciones básicas como SQL nativo", () => {
    expect(compile("Sum([monto])")).toBe("SUM(`monto`)");
    expect(compile("Min([monto])")).toBe("MIN(`monto`)");
    expect(compile("Max([monto])")).toBe("MAX(`monto`)");
    expect(compile("Count([id])")).toBe("COUNT(`id`)");
    expect(compile("Count(*)")).toBe("COUNT(*)");
    expect(compile("Count(DISTINCT [id])")).toBe("COUNT(DISTINCT `id`)");
    expect(compile("Sum(DISTINCT [monto])")).toBe("SUM(DISTINCT `monto`)");
  });

  it("implementa contadores Qlik distinguiendo NULL texto y número", () => {
    expect(compile("NullCount([x])")).toContain("COUNTIF(`x` IS NULL)");
    expect(compile("NumericCount([x])")).toContain("COUNTIF(SAFE_CAST(");
    expect(compile("TextCount([x])")).toContain("`x` IS NOT NULL AND SAFE_CAST(");
    expect(compile("MissingCount([x])")).toContain("COUNTIF(SAFE_CAST(");
    expect(compile("MissingCount([x])")).toContain(" IS NULL)");
    expectCode(
      () => compile("NumericCount(DISTINCT [x])"),
      "AGGREGATION_DISTINCT_REQUIRES_TYPED_LOWERING",
    );
  });

  it("RangeSum trata no-numéricos como cero sin subquery innecesaria", () => {
    const sql = compile("RangeSum([a], [b], 'abc', Null())");
    expect(sql).toContain("COALESCE(SAFE_CAST(");
    expect(sql).toContain(" + ");
    expect(sql).not.toContain("SELECT");
  });

  it("RangeAvg Min Max ignoran no-numéricos y usan un array tipado", () => {
    const avg = compile("RangeAvg([a], [b], 'abc')");
    expect(avg).toContain("SELECT AVG(value) FROM UNNEST([");
    const min = compile("RangeMin([a], [b])");
    expect(min).toContain("SELECT MIN(value) FROM UNNEST([");
    const max = compile("RangeMax([a], [b])");
    expect(max).toContain("SELECT MAX(value) FROM UNNEST([");
  });

  it("implementa contadores Range sin confundir texto y NULL", () => {
    expect(compile("RangeCount([a], [b])")).toContain("CASE WHEN `a` IS NULL THEN 0 ELSE 1 END");
    expect(compile("RangeNullCount([a], [b])")).toContain("CASE WHEN `a` IS NULL THEN 1 ELSE 0 END");
    expect(compile("RangeNumericCount([a], [b])")).toContain("SAFE_CAST(");
    expect(compile("RangeTextCount([a], [b])")).toContain("`a` IS NOT NULL");
    expect(compile("RangeMissingCount([a], [b])")).toContain(" IS NULL THEN 1 ELSE 0 END");
  });

  it("usa funciones BigQuery nativas para exponenciales y logaritmos", () => {
    expect(compile("Exp([x])")).toContain("EXP(");
    expect(compile("Log([x])")).toContain("LN(");
    expect(compile("Log10([x])")).toContain("LOG10(");
    expect(compile("Pow([x], [y])")).toContain("POW(");
    expect(compile("Sqr([x])")).toContain("POW(");
    expect(compile("Sqr([x])")).toContain(", 2)");
    expect(compile("Sqrt([x])")).toContain("SQRT(");
  });

  it("usa funciones BigQuery nativas para trigonometría e hiperbólicas", () => {
    for (const name of [
      "Acos", "Acosh", "Asin", "Asinh", "Atan", "Atanh",
      "Cos", "Cosh", "Sin", "Sinh", "Tan", "Tanh",
    ]) expect(compile(`${name}([x])`)).toContain(`${name.toUpperCase()}(`);
    expect(compile("Atan2([y], [x])")).toContain("ATAN2(");
  });

  it("emite constantes matemáticas y Rand sin construcciones artificiales", () => {
    expect(compile("e()")) .toBe("EXP(1)");
    expect(compile("pi()")) .toBe("ACOS(-1)");
    expect(compile("rand()")) .toBe("RAND()");
  });

  it("no confunde los duales true false e IsText con BOOL de BigQuery", () => {
    expectCode(() => compile("true()"), "FUNCTION_NOT_RUNTIME_IMPLEMENTED");
    expectCode(() => compile("false()"), "FUNCTION_NOT_RUNTIME_IMPLEMENTED");
    expectCode(() => compile("IsText([x])"), "FUNCTION_NOT_RUNTIME_IMPLEMENTED");
  });

  it("implementa Div truncando hacia cero como Qlik", () => {
    const sql = compile("Div([a], [b])");
    expect(sql).toContain("TRUNC(SAFE_DIVIDE(");
    expect(sql).toContain("AS INT64");
  });

  it("implementa Mod no-negativo y valida enteros/divisor positivo", () => {
    const sql = compile("Mod([a], [b])");
    expect(sql).toContain("TRUNC(");
    expect(sql).toContain("<= 0");
    expect(sql).toContain("FLOOR(");
    expect(sql).toContain("THEN NULL ELSE");
  });

  it("implementa BitCount sobre palabra Qlik signed-32 y Sign", () => {
    const bits = compile("BitCount([valor])");
    expect(bits).toContain("BIT_COUNT(");
    expect(bits).toContain("4294967295");
    expect(compile("Sign([valor])")).toContain("SIGN(SAFE_CAST(");
  });

  it("implementa Fmod con resto truncado y signo del dividendo", () => {
    const sql = compile("Fmod([a], [b])");
    expect(sql).toContain("TRUNC(SAFE_DIVIDE(");
    expect(sql).toContain("THEN NULL ELSE");
    expect(sql).toContain(" - ");
  });

  it("implementa Frac como x - Floor(x), incluso para negativos", () => {
    const sql = compile("Frac([x])");
    expect(sql).toContain(" - FLOOR(");
  });

  it("implementa Even y la rareza oficial Odd(0)=True", () => {
    const even = compile("Even([x])");
    expect(even).toContain("= 0 THEN -1");
    expect(even).toContain("MOD(ABS(");
    const odd = compile("Odd([x])");
    expect(odd).toContain("= 0 THEN -1");
    expect(odd).toContain("= 1 THEN -1 ELSE 0");
  });

  it("implementa Match case-sensitive y devuelve posición 1-based", () => {
    const sql = compile("Match([valor], 'A', 'B', 'C')");
    expect(sql).toContain("WHEN CAST(`valor` AS STRING) = CAST('A' AS STRING) THEN 1");
    expect(sql).toContain("WHEN CAST(`valor` AS STRING) = CAST('C' AS STRING) THEN 3");
    expect(sql).toContain("ELSE 0 END");
  });

  it("implementa EmptyIsNull sin cambiar el tipo del valor no vacío", () => {
    expect(compile("EmptyIsNull([valor])")).toBe(
      "CASE WHEN CAST(`valor` AS STRING) = '' THEN NULL ELSE `valor` END",
    );
  });

  it("implementa operadores bitwise Qlik sobre signed-32", () => {
    const notSql = compile("bitnot 17");
    expect(notSql).toContain("~");
    expect(notSql).toContain("4294967296");
    expect(compile("17 bitand 7")).toContain(" & ");
    expect(compile("17 bitor 7")).toContain(" | ");
    expect(compile("17 bitxor 7")).toContain(" ^ ");
    expect(compile("8 << 2")).toContain(" << ");
  });

  it("no aproxima right-shift Qlik de signed-32 con el shift lógico de BigQuery", () => {
    expectCode(() => compile("[valor] >> 2"), "OPERATOR_RIGHT_SHIFT_REQUIRES_REFERENCE_VECTOR");
  });

  it("rechaza condicionales que requieren tipos/collation Qlik exactos", () => {
    expectCode(() => compile("Coalesce([a], [b])"), "FUNCTION_REQUIRES_TYPED_LOWERING");
    expectCode(() => compile("Pick(2, [a], [b])"), "FUNCTION_REQUIRES_TYPED_LOWERING");
    expectCode(() => compile("MixMatch([x], 'a', 'b')"), "FUNCTION_REQUIRES_QLIK_COLLATION");
    expectCode(() => compile("WildMatch([x], 'a*')"), "FUNCTION_REQUIRES_QLIK_COLLATION");
  });

  it("no sustituye hashes Qlik por hashes BigQuery incompatibles", () => {
    expectCode(() => compile("Hash128([id], [texto])"), "FUNCTION_REQUIRES_QLIK_HASH_UDF");
    expectCode(() => compile("Hash256([id], [texto])"), "FUNCTION_REQUIRES_QLIK_HASH_UDF");
  });

  it("rechaza funciones no implementadas y formatos dependientes de entorno ausente", () => {
    expectCode(() => compile("ApplyMap('m', [id])"), "APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING");
    expectCode(() => compile("Date([fecha])"), "DATE_FORMAT_ENV_REQUIRED");
  });

  it("rechaza nombres que ni siquiera existen en el inventario oficial", () => {
    expectCode(() => compile("FuncionInventada([id])"), "FUNCTION_NOT_IN_OFFICIAL_INVENTORY");
  });

  it("baja edad, numeración de días y nombres temporales como SQL dual", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      firstWeekDay: 0,
      brokenWeeks: 0,
      referenceDay: 4,
    } satisfies EntornoExpresionQlik;

    expect(compile("Age('2024-02-28', '2000-02-29')")).toContain("DATE_DIFF(");
    expect(compile("DayNumberOfYear('2024-02-29')")).toContain("DATE_DIFF(");
    expect(compile("DayNumberOfQuarter('2024-02-29')")).toContain("DATE_DIFF(");
    expect(compileWithEnv("MonthName('2024-02-29') * 1", environment)).toContain("TIMESTAMP_DIFF(");
    expect(compileWithEnv("QuarterName('2024-02-29')", environment)).toContain("WHEN 1 THEN 'Jan'");
    expect(compileWithEnv("WeekName('2024-02-29')", environment)).toContain("EXTRACT(ISOWEEK FROM");
    expect(compileWithEnv("YearName('2024-02-29')", environment)).toContain("FORMAT_DATE('%Y'");
  });

  it("baja límites de semana, fechas ISO, segmentos e inclusiones temporales", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      firstWeekDay: 0,
      brokenWeeks: 0,
      referenceDay: 4,
    } satisfies EntornoExpresionQlik;

    expect(compileWithEnv("WeekStart('2024-02-29')", environment)).toContain("DATE_SUB(");
    expect(compileWithEnv("WeekEnd('2024-02-29')", environment)).toContain("INTERVAL 1 MILLISECOND");
    expect(compileWithEnv("MakeWeekDate(2024, 9, 4)", environment)).toContain("ISOWEEK");
    expect(compileWithEnv("MonthsStart(3, '2024-02-29')", environment)).toContain("DATE_DIFF(");
    expect(compileWithEnv("MonthsEnd(3, '2024-02-29')", environment)).toContain("INTERVAL 1 MILLISECOND");
    expect(compile("InDay('2024-02-29', '2024-02-29', 0)")).toContain("THEN -1 ELSE 0 END");
    expect(compile("InMonths(3, '2024-02-29', '2024-02-01', 0)")).toContain("TIMESTAMP(");
    expect(compile("InYearToDate('2024-02-28', '2024-02-29', 0)")).toContain("<=");
  });

  it("baja jornadas laborales nativas y conserva fechas de retorno", () => {
    const environment = { dateFormat: "YYYY-MM-DD" } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("NetworkDays('2024-02-01', '2024-02-09', '2024-02-05')", environment)).toContain("GENERATE_DATE_ARRAY");
    expect(compileWithEnv("FirstWorkDate('2024-02-09', 5, '2024-02-05')", environment)).toContain("ARRAY_AGG");
    expect(compileWithEnv("LastWorkDate('2024-02-01', 5, '2024-02-05')", environment)).toContain("ARRAY_AGG");
    expect(compileWithEnv("SetDateYearMonth('2024-02-29 10:15:00', 2025, 3)", environment)).toContain("SAFE.PARSE_DATE");
  });

  it("solo acepta funciones de reloj con semántica UTC de ejecución representable", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      timestampFormat: "YYYY-MM-DD hh:mm:ss",
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("Now()", environment)).toContain("CURRENT_TIMESTAMP()");
    expect(compileWithEnv("Today()", environment)).toContain("CURRENT_DATE('UTC')");
    expect(compileWithEnv("GMT()", environment)).toContain("CURRENT_TIMESTAMP()");
    expect(compileWithEnv("UTC()", environment)).toContain("CURRENT_TIMESTAMP()");
    expect(compile("TimeZone()")).toContain("'UTC'");
    expectCode(() => compile("LocalTime('Quito')"), "TEMPORAL_RUNTIME_CONTEXT_REQUIRED");
    expectCode(() => compile("ConvertToLocalTime([ts], 'Quito')"), "TEMPORAL_RUNTIME_CONTEXT_REQUIRED");
  });
});

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

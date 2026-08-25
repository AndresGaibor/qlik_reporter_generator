import { describe, expect, it } from "bun:test";
import {
  compile,
  compileCondition,
  expectCode,
} from "./expresiones-qlik-test-helpers.js";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";

describe("parser de expresiones Qlik vNext / parser, texto, JSON y regex", () => {
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
      left: {
        kind: "unary",
        operator: "not",
        operand: { kind: "binary", operator: "=" },
      },
      right: { kind: "binary", operator: "and" },
    });
    const sql = compileCondition("not [a] = 1 or [b] <> 2 and [c] >= 3");
    expect(sql).toContain("NOT (");
    expect(sql).toContain("`b` != 2");
    expect(sql).toContain("`c` >= 3");
  });

  it("normaliza literales DateFormat en comparaciones de fecha", () => {
    const sql = emitirExpresionBigQuery(
      parsearExpresionQlik("[Fecha] = '6/1/2026'"),
      "condition",
      { dateFormat: "M/D/YYYY" },
    );
    expect(sql).toBe("`Fecha` = DATE '2026-06-01'");

    const texto = emitirExpresionBigQuery(
      parsearExpresionQlik("[Codigo] = 'abc'"),
      "condition",
      { dateFormat: "M/D/YYYY" },
    );
    expect(texto).toBe("`Codigo` = 'abc'");
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
    expect(compile("Ord([texto])")).toContain(
      "TO_CODE_POINTS(CAST(`texto` AS STRING))",
    );
    expect(compile("Repeat([texto], 3)")).toBe(
      "REPEAT(CAST(`texto` AS STRING), CAST(3 AS INT64))",
    );
  });

  it("implementa KeepChar y PurgeChar por code point Unicode", () => {
    expect(compile("KeepChar([texto], 'ABC')")).toContain(
      "CODE_POINTS_TO_STRING",
    );
    expect(compile("KeepChar([texto], 'ABC')")).toContain(
      "IN UNNEST(TO_CODE_POINTS",
    );
    expect(compile("PurgeChar([texto], 'ABC')")).toContain(
      "NOT IN UNNEST(TO_CODE_POINTS",
    );
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
    expect(compile("Capitalize([texto])")).toBe(
      "INITCAP(CAST(`texto` AS STRING))",
    );
    expect(compile("LevenshteinDist([a], [b])")).toBe(
      "EDIT_DISTANCE(CAST(`a` AS STRING), CAST(`b` AS STRING))",
    );
  });

  it("implementa IsJson con validación de tipo y booleano Qlik -1/0", () => {
    const result = compile("IsJson([texto])");
    expect(result).toContain("SAFE.PARSE_JSON");
    expect(result).toContain("THEN 0 ELSE -1 END");
    const object = compile("IsJson([texto], 'object')");
    expect(object).toContain("JSON_TYPE(");
    expect(object).toContain("= 'object'");
  });

  it("JsonGet usa JSON Pointer literal con SQL limpio para propiedades", () => {
    const sql = compile("JsonGet([json], '/customer/email')");
    expect(sql).toContain(
      'JSON_QUERY(SAFE.PARSE_JSON(CAST(`json` AS STRING)), \'$."customer"."email"\')',
    );
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
    expect(sql).toContain('$."a/b"."~x"');
    expectCode(
      () => compile("JsonGet([json], [ruta])"),
      "JSON_POINTER_DYNAMIC_REQUIRES_UDF",
    );
    expectCode(() => compile("JsonGet([json], 'a/b')"), "JSON_POINTER_INVALID");
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
    expect(sql).toContain('\'$."items"."price"\'');
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
    const first = compile(
      "ExtractRegExGroup([texto], '([a-z]+)([0-9]+)', 1, 2)",
    );
    expect(first).toContain("REGEXP_EXTRACT(");
    expect(first).toContain("([a-z]+)(?:[0-9]+)");
    expect(first).toContain(", 1, CAST(TRUNC(2) AS INT64))");
    const second = compile(
      "ExtractRegExGroupI([texto], '([a-z]+)([0-9]+)', 2, 1)",
    );
    expect(second).toContain("(?i:(?:[a-z]+)([0-9]+))");
  });

  it("usa IndexRegExGroup nativo solo para group 0 y reserva grupos internos a UDF exacta", () => {
    expect(
      compile("IndexRegExGroup([texto], '([a-z]+)([0-9]+)', 0, 2)"),
    ).toContain("REGEXP_INSTR(");
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
    expect(
      compile("ReplaceRegExGroup([texto], '([a-z]+)([0-9]+)', 'x', 0)"),
    ).toContain("REGEXP_REPLACE(");
    expectCode(
      () => compile("ReplaceRegExGroup([texto], '([a-z]+)([0-9]+)', 'x', 2)"),
      "REGEX_GROUP_REPLACEMENT_REQUIRES_UDF",
    );
  });

  it("IsRegEx se clasifica como validación Perl/Qlik y no como validación RE2", () => {
    expectCode(
      () => compile("IsRegEx([patron])"),
      "REGEX_VALIDATION_REQUIRES_UDF",
    );
    expectCode(
      () => compile("IsRegExI([patron])"),
      "REGEX_VALIDATION_REQUIRES_UDF",
    );
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
    expect(compile("SubField([texto], '|', 2)")).toContain(
      "SAFE_ORDINAL(CAST(2 AS INT64))",
    );
    expect(compile("SubField([texto], '|', -1)")).toContain("ARRAY_LENGTH(");
    expect(compile("SubField([texto], '|', 1)")).toContain(
      "COALESCE(CAST(`texto` AS STRING), '')",
    );
    expectCode(
      () => compile("SubField([texto], '|')"),
      "SUBFIELD_EXPANDING_REQUIRES_RELATIONAL_LOWERING",
    );
  });
});

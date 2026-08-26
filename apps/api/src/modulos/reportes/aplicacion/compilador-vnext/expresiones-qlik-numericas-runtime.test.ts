import { describe, expect, it } from "bun:test";
import { compile, expectCode } from "./expresiones-qlik-test-helpers.js";

describe("parser de expresiones Qlik vNext / numéricas y runtime", () => {
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
      "Acos",
      "Acosh",
      "Asin",
      "Asinh",
      "Atan",
      "Atanh",
      "Cos",
      "Cosh",
      "Sin",
      "Sinh",
      "Tan",
      "Tanh",
    ])
      expect(compile(`${name}([x])`)).toContain(`${name.toUpperCase()}(`);
    expect(compile("Atan2([y], [x])")).toContain("ATAN2(");
  });

  it("emite constantes matemáticas y Rand sin construcciones artificiales", () => {
    expect(compile("e()")).toBe("EXP(1)");
    expect(compile("pi()")).toBe("ACOS(-1)");
    expect(compile("rand()")).toBe("RAND()");
  });

  it("conserva los duales true false e IsText con booleanos Qlik", () => {
    expect(compile("true()")).toBe("-1");
    expect(compile("false()")).toBe("0");
    expect(compile("IsText([x])")).toContain("THEN -1 ELSE 0 END");
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
    expect(sql).toContain(
      "WHEN CAST(`valor` AS STRING) = 'A' THEN 1",
    );
    expect(sql).toContain(
      "WHEN CAST(`valor` AS STRING) = 'C' THEN 3",
    );
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
    expectCode(
      () => compile("[valor] >> 2"),
      "OPERATOR_RIGHT_SHIFT_REQUIRES_REFERENCE_VECTOR",
    );
  });

  it("baja condicionales tipados y rechaza solo la collation no equivalente", () => {
    expect(compile("Coalesce([a], [b])")).toContain(
      "CASE WHEN `a` IS NOT NULL",
    );
    expect(compile("Pick(2, [a], [b])")).toContain("CASE WHEN");
    expectCode(
      () => compile("MixMatch([x], 'a', 'b')"),
      "FUNCTION_REQUIRES_QLIK_COLLATION",
    );
    expectCode(
      () => compile("WildMatch([x], 'a*')"),
      "FUNCTION_REQUIRES_QLIK_COLLATION",
    );
  });

  it("no sustituye hashes Qlik por hashes BigQuery incompatibles", () => {
    expectCode(
      () => compile("Hash128([id], [texto])"),
      "FUNCTION_REQUIRES_QLIK_HASH_UDF",
    );
    expectCode(
      () => compile("Hash256([id], [texto])"),
      "FUNCTION_REQUIRES_QLIK_HASH_UDF",
    );
  });

  it("rechaza funciones no implementadas y formatos dependientes de entorno ausente", () => {
    expectCode(
      () => compile("ApplyMap('m', [id])"),
      "APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING",
    );
    expectCode(() => compile("Date([fecha])"), "DATE_FORMAT_ENV_REQUIRED");
  });

  it("rechaza nombres que ni siquiera existen en el inventario oficial", () => {
    expectCode(
      () => compile("FuncionInventada([id])"),
      "FUNCTION_NOT_IN_OFFICIAL_INVENTORY",
    );
  });

  it("no inventa el archivo actualmente leído ni efectos de filesystem/QVD", () => {
    expectCode(
      () => compile("FileBaseName()"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FileDir()"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FileExtension()"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FileName()"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FilePath()"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FileSize('dir/ventas.csv')"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("FileTime('dir/ventas.csv')"),
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("QvdNoOfRecords('dir/ventas.qvd')"),
      "EXTERNAL_QVD_METADATA_UNAVAILABLE",
    );
  });

  it("rechaza valores dependientes del entorno Qlik y usa GEOGRAPHY solo en casos nativos", () => {
    expectCode(
      () => compile("ComputerName()"),
      "ENVIRONMENT_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("DocumentName()"),
      "ENVIRONMENT_METADATA_UNAVAILABLE",
    );
    expectCode(
      () => compile("ReloadTime()"),
      "ENVIRONMENT_METADATA_UNAVAILABLE",
    );
    expect(compile("GeoMakePoint(1, 2)")).toContain("ST_GEOGPOINT(2, 1)");
    expect(compile("GeoGetPolygonCenter([geometry])")).toContain(
      "ST_CENTROID(`geometry`)",
    );
    expectCode(
      () => compile("GeoProject([geometry])"),
      "GEOSPATIAL_SEMANTICS_UNSUPPORTED",
    );
  });
});

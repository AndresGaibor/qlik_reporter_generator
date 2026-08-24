import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function compile(name: string) {
  const script = await Bun.file(corpus(name)).text();
  return compilarDataflowVNext(script);
}

describe("fixtures de funciones Qlik vNext", () => {
  it("compila la suite temporal con entorno SET explícito", async () => {
    const result = await compile("qlik-date-suite.qlik");
    expect(result.sql).toContain("FORMAT_DATE('%Y-%m-%d'");
    expect(result.sql).toContain("CASE EXTRACT(MONTH FROM");
    expect(result.sql).toContain("DATE_TRUNC(");
    expect(result.sql).toContain("TIMESTAMP_SUB(");
    expect(result.sql).toContain("INTERVAL 1 MILLISECOND");
    expect(result.sql).toContain("EXTRACT(ISOWEEK FROM");
    expect(result.sql).toContain("EXTRACT(ISOYEAR FROM");
    expect(result.sql).toContain("WHEN 0 THEN 'Mon'");
    expect(result.sql).toContain("WHEN 6 THEN 'Sun'");
  });

  it("compila Num, Round, Floor y Ceil", async () => {
    const result = await compile("qlik-number-suite.qlik");
    expect(result.sql).toContain("STRING FORMAT");
    expect(result.sql).toContain("FLOOR(");
    expect(result.sql).toContain("CEIL(");
  });

  it("compila agregaciones y Range con SQL nativo donde corresponde", async () => {
    const result = await compile("qlik-aggregate-range-suite.qlik");
    expect(result.sql).toContain("COUNT(*) AS `filas`");
    expect(result.sql).toContain("COUNT(DISTINCT `id`) AS `ids`");
    expect(result.sql).toContain("SUM(DISTINCT `monto`) AS `monto_distinto`");
    expect(result.sql).toContain("COUNTIF(`valor` IS NULL)");
    expect(result.sql).toContain("COALESCE(SAFE_CAST(");
    expect(result.sql).toContain("SELECT AVG(value) FROM UNNEST([");
  });

  it("compila el lowering exacto de agregados avanzados y finanzas", async () => {
    const result = await compile(
      "qlik-advanced-aggregate-financial-suite.qlik",
    );
    expect(result.sql).toContain("CORR(");
    expect(result.sql).toContain("STDDEV_SAMP(");
    expect(result.sql).toContain("ROW_NUMBER() OVER (ORDER BY");
    expect(result.sql).toContain("COUNT(*) = 1");
    expect(result.sql).toContain("WITH RECURSIVE");
    expect(result.sql).toContain("DATE_DIFF(");
    expect(result.sql).not.toContain("APPROX_");
  });

  it("compila matemáticas y trigonometría como GoogleSQL nativo", async () => {
    const result = await compile("qlik-math-trig-suite.qlik");
    expect(result.sql).toContain("EXP(");
    expect(result.sql).toContain("LN(");
    expect(result.sql).toContain("POW(");
    expect(result.sql).toContain("SQRT(");
    expect(result.sql).toContain("SIN(");
    expect(result.sql).toContain("COS(");
    expect(result.sql).toContain("ATAN2(");
    expect(result.sql).not.toContain("WITH fuente_");
  });
  it("compila la suite string ampliada sin degradar semántica", async () => {
    const result = await compile("qlik-string-suite.qlik");
    expect(result.sql).toContain("UPPER(TRIM(");
    expect(result.sql).toContain("INSTR(");
    expect(result.sql).toContain("EDIT_DISTANCE(");
    expect(result.sql).toContain("SAFE.PARSE_JSON(");
    expect(result.sql).toContain("COUNTIF(");
  });

  it("compila JSON con rutas limpias y validación solo donde hace falta", async () => {
    const result = await compile("qlik-json-suite.qlik");
    expect(result.sql).toContain("JSON_QUERY(");
    expect(result.sql).toContain("JSON_SET(");
    expect(result.sql).toContain('$."customer"."email"');
    expect(result.sql).toContain("JSON_TYPE(");
  });

  it("compila MAPPING LOAD + ApplyMap con lookup relacional typed-dual", async () => {
    const result = await compile("qlik-mapping-applymap.qlik");
    expect(result.sql).toContain("LEFT JOIN");
    expect(result.sql).toMatch(/__qlik_map_[A-Za-z0-9_]+_hit/);
    expect(result.sql).toContain("ELSE 'DESCONOCIDO'");
  });

  it("compila SubField escalar con field_no", async () => {
    const result = await compile("qlik-split-suite.qlik");
    expect(result.sql).toContain("SPLIT(");
    expect(result.sql).toContain("SAFE_ORDINAL(");
  });

  it("rechaza hashes Qlik hasta contar con UDF exacta", async () => {
    await expectCode(
      () => compile("qlik-hash-suite.qlik"),
      "FUNCTION_REQUIRES_QLIK_HASH_UDF",
    );
  });

  it("bloquea reutilización downstream de un dual no materializado", async () => {
    await expectCode(
      () =>
        Promise.resolve(
          compilarDataflowVNext(`
            SET DateFormat='YYYY-MM-DD';
            LIB CONNECT TO [Google BigQuery:Prod];
            [A]: LOAD Date(fecha) AS fecha_fmt;
            SQL SELECT fecha FROM \`p.d.a\`;
            [B]: LOAD Year(fecha_fmt) AS anio RESIDENT [A];
          `),
        ),
      "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
    );
  });
});
async function expectCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

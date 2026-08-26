import { describe, expect, it } from "bun:test";
import {
  ESTADISTICA_SQL_FORMULA,
  ESTADISTICA_UDF_REQUIRED,
  clasificarFuncionEstadistica,
  emitirFuncionEstadistica,
  esFuncionEstadistica,
} from "./estadistica.js";
import {
  type ExprQlik,
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const targets = [
  "BetaDensity",
  "BetaDist",
  "BetaInv",
  "BinomDist",
  "BinomFrequency",
  "BinomInv",
  "ChiDensity",
  "ChiDist",
  "ChiInv",
  "FDensity",
  "FDist",
  "FInv",
  "GammaDensity",
  "GammaDist",
  "GammaInv",
  "NormDist",
  "NormInv",
  "PoissonDist",
  "PoissonFrequency",
  "PoissonInv",
  "TDensity",
  "TDist",
  "TInv",
  "TTest1_conf",
  "TTest1_df",
  "TTest1_dif",
  "TTest1_lower",
  "TTest1_sig",
  "TTest1_sterr",
  "TTest1_t",
  "TTest1_upper",
  "TTest1w_conf",
  "TTest1w_df",
  "TTest1w_dif",
  "TTest1w_lower",
  "TTest1w_sig",
  "TTest1w_sterr",
  "TTest1w_t",
  "TTest1w_upper",
  "TTest_conf",
  "TTest_df",
  "TTest_dif",
  "TTest_lower",
  "TTest_sig",
  "TTest_sterr",
  "TTest_t",
  "TTest_upper",
  "TTestw_conf",
  "TTestw_df",
  "TTestw_dif",
  "TTestw_lower",
  "TTestw_sig",
  "TTestw_sterr",
  "TTestw_t",
  "TTestw_upper",
  "ZTest_conf",
  "ZTest_dif",
  "ZTest_lower",
  "ZTest_sig",
  "ZTest_sterr",
  "ZTest_upper",
  "ZTest_z",
  "ZTestw_conf",
  "ZTestw_dif",
  "ZTestw_lower",
  "ZTestw_sig",
  "ZTestw_sterr",
  "ZTestw_upper",
  "ZTestw_z",
  "Chi2Test_chi2",
  "Chi2Test_df",
  "Chi2Test_p",
  "Correl",
  "Fractile",
  "FractileExc",
  "Kurtosis",
  "LINEST_B",
  "LINEST_DF",
  "LINEST_F",
  "LINEST_M",
  "LINEST_R2",
  "LINEST_SEB",
  "LINEST_SEM",
  "LINEST_SEY",
  "LINEST_SSREG",
  "LINEST_SSRESID",
  "Median",
  "Skew",
  "Stdev",
  "Sterr",
  "STEYX",
  "MutualInfo",
];

function contexto() {
  const emit = (expression: ExprQlik): string => {
    if (expression.kind === "identifier") return `\`${expression.name}\``;
    if (expression.kind === "number") return expression.raw;
    if (expression.kind === "string") return `'${expression.value}'`;
    return "<expr>";
  };
  return {
    emitValue: emit,
    emitNumeric: emit,
    fail(code: string, message: string): never {
      throw new ErrorCompilacionVNext({
        code,
        category: "BIGQUERY_LOWERING",
        message,
        span: {
          start: 0,
          end: 0,
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 1,
        },
      });
    },
  };
}

describe("clasificación estadística", () => {
  it("clasifica todos los objetivos rastreados sin dejar nombres huérfanos", () => {
    for (const target of targets)
      expect(esFuncionEstadistica(target)).toBe(true);
    expect(clasificarFuncionEstadistica("Correl")).toBe("native_bigquery");
    expect(clasificarFuncionEstadistica("BinomFrequency")).toBe("sql_formula");
    expect(clasificarFuncionEstadistica("NormDist")).toBe("udf_required");
    expect(clasificarFuncionEstadistica("MutualInfo")).toBe(
      "external_non_equivalent",
    );
    expect(ESTADISTICA_SQL_FORMULA.has("LINEST_M")).toBe(true);
    expect(ESTADISTICA_UDF_REQUIRED.has("TTest_sig")).toBe(true);
  });
});

describe("lowering estadístico dedicado", () => {
  it("emite correlación y desviación estándar muestral nativas", () => {
    expect(
      emitirFuncionEstadistica(
        "Correl",
        [parsearExpresionQlik("[x]"), parsearExpresionQlik("[y]")],
        [],
        contexto(),
      ),
    ).toBe("CORR(`x`, `y`)");
    expect(
      emitirFuncionEstadistica(
        "Stdev",
        [parsearExpresionQlik("[x]")],
        [],
        contexto(),
      ),
    ).toBe("STDDEV_SAMP(`x`)");
  });

  it("preserva la interpolación exacta y nunca degrada a APPROX", () => {
    const sql = emitirFuncionEstadistica(
      "Fractile",
      [parsearExpresionQlik("[x]"), parsearExpresionQlik("0.25")],
      [],
      contexto(),
    );
    expect(sql).toContain("ARRAY_AGG");
    expect(sql).toContain("(N - 1)");
    expect(sql).not.toContain("APPROX_");
  });

  it("rechaza explícitamente las distribuciones que requieren una UDF exacta", () => {
    expect(() =>
      emitirFuncionEstadistica("NormDist", [], [], contexto()),
    ).toThrowError(ErrorCompilacionVNext);
    try {
      emitirFuncionEstadistica("NormDist", [], [], contexto());
    } catch (error) {
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "STATISTICS_REQUIRES_EXACT_UDF",
      );
    }
  });

  it("usa sumas finitas para PMF y CDF discretas sin APPROX", () => {
    const binom = emitirFuncionEstadistica(
      "BinomDist",
      [
        parsearExpresionQlik("2"),
        parsearExpresionQlik("10"),
        parsearExpresionQlik("0.5"),
      ],
      [],
      contexto(),
    );
    const poisson = emitirFuncionEstadistica(
      "PoissonFrequency",
      [parsearExpresionQlik("2"), parsearExpresionQlik("3")],
      [],
      contexto(),
    );
    expect(binom).toContain("GENERATE_ARRAY(0");
    expect(binom).toContain("POW");
    expect(poisson).toContain("EXP(-");
    expect(`${binom}${poisson}`).not.toContain("APPROX_");
  });

  it("mantiene pesos de frecuencia enteros y pares no NULL en los componentes de prueba", () => {
    const weighted = emitirFuncionEstadistica(
      "TTest1w_sterr",
      [parsearExpresionQlik("[weight]"), parsearExpresionQlik("[value]")],
      [],
      contexto(),
    );
    const twoSample = emitirFuncionEstadistica(
      "TTest_dif",
      [parsearExpresionQlik("[group]"), parsearExpresionQlik("[value]")],
      [],
      contexto(),
    );
    expect(weighted).toContain("TRUNC");
    expect(weighted).toContain("- 1");
    expect(twoSample).toContain("ARRAY_AGG");
    expect(twoSample).toContain("IS NOT NULL");
    expect(twoSample).toContain("VAR_SAMP");
  });

  it("usa regresión por pares y grados de libertad muestrales exactos", () => {
    const sql = emitirFuncionEstadistica(
      "LINEST_SSRESID",
      [parsearExpresionQlik("[y]"), parsearExpresionQlik("[x]")],
      [],
      contexto(),
    );
    expect(sql).toContain("STRUCT(`y` AS y, `x` AS x)");
    expect(sql).toContain("COVAR_SAMP");
    expect(sql).toContain("VAR_SAMP");
    expect(
      emitirFuncionEstadistica(
        "LINEST_DF",
        [parsearExpresionQlik("[y]"), parsearExpresionQlik("[x]")],
        [],
        contexto(),
      ),
    ).toContain("COUNT(*) - 2");
  });

  it("integra el lowering dedicado antes del estado runtime y conserva diagnósticos externos", () => {
    expect(
      emitirExpresionBigQuery(parsearExpresionQlik("Correl([x], [y])")),
    ).toBe(
      "CORR(SAFE_CAST(CAST(`x` AS STRING) AS BIGNUMERIC), SAFE_CAST(CAST(`y` AS STRING) AS BIGNUMERIC))",
    );
    expect(() =>
      emitirExpresionBigQuery(parsearExpresionQlik("MutualInfo([x], [y])")),
    ).toThrowError(/semántica estadística externa/);
    try {
      emitirExpresionBigQuery(parsearExpresionQlik("MutualInfo([x], [y])"));
    } catch (error) {
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "STATISTICS_EXTERNAL_NON_EQUIVALENT",
      );
      expect((error as ErrorCompilacionVNext).diagnostic.category).toBe(
        "BIGQUERY_LOWERING",
      );
    }
  });
});

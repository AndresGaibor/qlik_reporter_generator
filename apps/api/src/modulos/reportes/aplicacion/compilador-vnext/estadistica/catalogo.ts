import type { ClasificacionFuncionEstadistica } from "./tipos.js";

export const nativeNames = ["Correl", "Stdev"] as const;

export const sqlFormulaNames = [
  "BinomDist",
  "BinomFrequency",
  "PoissonDist",
  "PoissonFrequency",
  "Chi2Test_chi2",
  "Chi2Test_df",
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
  "Sterr",
  "STEYX",
  "TTest1_df",
  "TTest1_dif",
  "TTest1_sterr",
  "TTest1_t",
  "TTest1w_df",
  "TTest1w_dif",
  "TTest1w_sterr",
  "TTest1w_t",
  "TTest_df",
  "TTest_dif",
  "TTest_sterr",
  "TTest_t",
  "TTestw_df",
  "TTestw_dif",
  "TTestw_sterr",
  "TTestw_t",
  "ZTest_dif",
  "ZTest_sterr",
  "ZTest_z",
  "ZTestw_dif",
  "ZTestw_sterr",
  "ZTestw_z",
] as const;

export const udfNames = [
  "BetaDensity",
  "BetaDist",
  "BetaInv",
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
  "PoissonInv",
  "TDensity",
  "TDist",
  "TInv",
  "TTest1_conf",
  "TTest1_lower",
  "TTest1_sig",
  "TTest1_upper",
  "TTest1w_conf",
  "TTest1w_lower",
  "TTest1w_sig",
  "TTest1w_upper",
  "TTest_conf",
  "TTest_lower",
  "TTest_sig",
  "TTest_upper",
  "TTestw_conf",
  "TTestw_lower",
  "TTestw_sig",
  "TTestw_upper",
  "ZTest_conf",
  "ZTest_lower",
  "ZTest_sig",
  "ZTest_upper",
  "ZTestw_conf",
  "ZTestw_lower",
  "ZTestw_sig",
  "ZTestw_upper",
  "Chi2Test_p",
] as const;

export const externalNames = ["MutualInfo"] as const;

export const ESTADISTICA_NATIVE_BIGQUERY = new Set<string>(nativeNames);

export const ESTADISTICA_SQL_FORMULA = new Set<string>(sqlFormulaNames);

export const ESTADISTICA_UDF_REQUIRED = new Set<string>(udfNames);

export const ESTADISTICA_EXTERNAL_NON_EQUIVALENT = new Set<string>(
  externalNames,
);

export const classifications = new Map<string, ClasificacionFuncionEstadistica>(
  [
    ...nativeNames.map(
      (name) => [name.toLowerCase(), "native_bigquery"] as const,
    ),
    ...sqlFormulaNames.map(
      (name) => [name.toLowerCase(), "sql_formula"] as const,
    ),
    ...udfNames.map((name) => [name.toLowerCase(), "udf_required"] as const),
    ...externalNames.map(
      (name) => [name.toLowerCase(), "external_non_equivalent"] as const,
    ),
  ],
);

export function esFuncionEstadistica(name: string): boolean {
  return classifications.has(name.toLowerCase());
}

export function clasificarFuncionEstadistica(
  name: string,
): ClasificacionFuncionEstadistica | undefined {
  return classifications.get(name.toLowerCase());
}

import { describe, expect, it } from "bun:test";
import {
  type EntornoExpresionQlik,
  emitirExpresionBigQuery,
  esExpresionDualQlik,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

function compile(
  expression: string,
  environment: EntornoExpresionQlik = {},
): string {
  return emitirExpresionBigQuery(
    parsearExpresionQlik(expression),
    "value",
    environment,
  );
}

function expectCode(expression: string, code: string): void {
  try {
    compile(expression);
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

describe("funciones Qlik tracked con lowering dedicado", () => {
  it("selecciona alt por representación numérica válida y conserva la rama dual", () => {
    const sql = compile(
      "alt(Date#([fecha], 'YYYY-MM-DD'), [fallback], 'sin fecha')",
    );

    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("SAFE.PARSE_DATE('%Y-%m-%d'");
    expect(sql).toContain("THEN CAST(`fecha` AS STRING)");
    expect(
      esExpresionDualQlik(
        "alt(Date#([fecha], 'YYYY-MM-DD'), [fallback], 'sin fecha')",
      ),
    ).toBe(true);
  });

  it("baja coalesce y pick como selección typed-dual, no como COALESCE heterogéneo", () => {
    const coalesce = compile("coalesce([a], Dual('dos', 2))");
    const pick = compile("pick(2, Dual('uno', 1), Dual('dos', 2))");

    expect(coalesce).toContain("CASE WHEN `a` IS NOT NULL THEN");
    expect(coalesce).toContain("ELSE 'dos' END");
    expect(pick).toContain(
      "CASE WHEN SAFE_CAST(CAST(2 AS STRING) AS BIGNUMERIC) = 2 THEN",
    );
    expect(pick).toContain("ELSE NULL END");
  });

  it("baja class con límites inclusivos/exclusivos y lower bound numérico", () => {
    const sql = compile("class([valor], 10, 'edad', 5)");

    expect(sql).toContain(
      "FLOOR((SAFE_CAST(CAST(`valor` AS STRING) AS BIGNUMERIC) - 5) / 10)",
    );
    expect(sql).toContain("CONCAT(");
    expect(sql).toContain("' <= edad < '");
  });

  it("interpreta Date#, Num#, Time# y Timestamp# sin perder el texto original", () => {
    expect(compile("Date#('21.10.2023', 'DD.MM.YYYY')")).toContain(
      "SAFE.PARSE_DATE('%d.%m.%Y', '21.10.2023')",
    );
    expect(compile("Num#('1,234.50', '#,##0.00', '.', ',')")).toContain(
      "REPLACE",
    );
    expect(compile("Time#('09:30', 'hh:mm')")).toContain(
      "SAFE.PARSE_TIME('%H:%M'",
    );
    expect(
      compile("Timestamp#('2023-03-15 13:45', 'YYYY-MM-DD hh:mm')"),
    ).toContain("SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M'");
    expect(
      esExpresionDualQlik("Timestamp#('2023-03-15 13:45', 'YYYY-MM-DD hh:mm')"),
    ).toBe(true);
  });

  it("baja Dual, Text, Interval, Money, Time y Timestamp con componentes separados", () => {
    const dual = compile("Dual('Q', 12)");
    const text = compile("Text(12)");
    const time = compile("Time(0.5, 'hh:mm:ss')");
    const timestamp = compile("Timestamp(45200.5, 'YYYY-MM-DD hh:mm:ss')");

    expect(dual).toBe("'Q'");
    expect(text).toBe("CAST(12 AS STRING)");
    expect(time).toContain("FORMAT_TIME('%H:%M:%S'");
    expect(timestamp).toContain("FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S'");
    expect(esExpresionDualQlik("Money(12, '$#,##0.00', '.', ',')")).toBe(true);
  });

  it("emite colores con alpha implícito/explicito y aritmética combinatoria", () => {
    expect(compile("RGB(0, 255, 0)")).toContain("16711935");
    expect(compile("ARGB(128, 0, 128, 0)")).toContain("CASE WHEN");
    expect(compile("HSL(0.33, 1, 0.5)")).toContain("ROUND(");
    expect(compile("Combin(35, 7)")).toContain("GENERATE_ARRAY");
    expect(compile("Fact(5)")).toContain("GENERATE_ARRAY");
    expect(compile("Permut(8, 3)")).toContain("GENERATE_ARRAY");
  });

  it("conserva booleanos Qlik -1/0 y NULL en IsNum/IsText", () => {
    expect(compile("true()")).toBe("-1");
    expect(compile("false()")).toBe("0");
    expect(compile("IsNum('12.5')")).toContain("THEN -1 ELSE 0 END");
    expect(compile("IsText('abc')")).toContain("THEN -1 ELSE 0 END");
  });

  it("rechaza collation y codepage no equivalentes con diagnósticos estables", () => {
    expectCode("MixMatch([x], 'a', 'b')", "FUNCTION_REQUIRES_QLIK_COLLATION");
    expectCode("WildMatch([x], 'a*')", "FUNCTION_REQUIRES_QLIK_COLLATION");
    expectCode("ApplyCodepage([x], 1252)", "FUNCTION_REQUIRES_EXACT_CODEPAGE");
  });
});

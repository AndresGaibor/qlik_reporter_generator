import { describe, expect, it } from "bun:test";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

function compile(expression: string, environment = {}) {
  return emitirExpresionBigQuery(
    parsearExpresionQlik(expression),
    "value",
    environment,
  );
}

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

describe("lowering exacto de agregaciones avanzadas y financieras", () => {
  it("usa SQL estadístico exacto para los rangos numéricos", () => {
    expect(compile("RangeCorrel(2,3,6,8,9,4)")).toContain("CORR");
    expect(compile("RangeFractile(0.24,1,2,4,6)")).toContain("ARRAY_AGG");
    expect(compile("RangeKurtosis(1,2,4,7)")).toContain("POW");
    expect(compile("RangeStdev(1,2,4)")).toContain("STDDEV_SAMP");
  });

  it("preserva strings, únicos y empates en funciones Range", () => {
    expect(compile("RangeMaxString(1,2,4,'abc')")).toContain("ORDER BY");
    expect(compile("RangeMinString('xyz','abc')")).toContain("ORDER BY");
    expect(compile("RangeOnly(10,10,10)")).toContain("COUNT(DISTINCT");
    expect(compile("RangeMode(1,2,9,2,4)")).toContain("COUNT(*)");
    expect(compile("RangeMode('a',4,'a',4)")).toContain("COUNT(DISTINCT");
  });

  it("emite los flujos financieros de rango sin APPROX", () => {
    const sql = [
      compile("RangeIRR(-70000,12000,15000,18000,21000,26000)"),
      compile("RangeNPV(0.1,-10000,3000,4200,6800)"),
      compile("RangeXIRR(-2500,'2008-01-01',2750,'2008-09-01')"),
      compile("RangeXNPV(0.1,-100,'2021-01-01',110,'2022-01-01')"),
    ].join("\n");
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain("DATE_DIFF");
    expect(sql).not.toContain("APPROX_");
  });

  it("implementa las funciones financieras escalares con dominio explícito", () => {
    const sql = [
      compile("BlackAndSchole(110,0.2,100,0.25,0.05,'call')"),
      compile("FV(0.05,10,-100,0,0)"),
      compile("nPer(0.05,-100,1000,0)"),
      compile("Pmt(0.05,10,1000,0,0)"),
      compile("PV(0.05,10,-100,0,0)"),
      compile("Rate(10,-100,1000,0,0)"),
    ].join("\n");
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("LOG");
    expect(sql).toContain("WITH RECURSIVE");
  });

  it("falla cerrado para FirstValue y LastValue sin orden probado", () => {
    expectCode(
      () => compile("FirstValue([valor])"),
      "AGGREGATION_ORDER_REQUIRED",
    );
    expectCode(
      () => compile("LastValue([valor])"),
      "AGGREGATION_ORDER_REQUIRED",
    );
  });

  it("explicita el orden en agregaciones ordenadas y el empate de FirstSortedValue", () => {
    const environment = {
      aggregationOrderBy: ["`fecha` ASC", "`id` ASC"],
    };
    const sql = [
      compile("FirstValue([valor])", environment),
      compile("LastValue([valor])", environment),
      compile("FirstSortedValue([valor],[peso],2)", environment),
      compile("Concat(DISTINCT [valor], '-', [peso])", environment),
    ].join("\n");
    expect(sql).toContain("ARRAY_AGG");
    expect(sql).toContain("ROW_NUMBER");
    expect(sql).toContain("STRING_AGG");
    expect(sql).toContain("COUNT(*) = 1");
  });

  it("emite Mode, MaxString, MinString y Only como agregaciones agrupadas", () => {
    const sql = [
      compile("Mode([valor])"),
      compile("MaxString([valor])"),
      compile("MinString([valor])"),
      compile("Only([valor])"),
    ].join("\n");
    expect(sql).toContain("ARRAY_AGG");
    expect(sql).toContain("COUNT(DISTINCT");
  });
});

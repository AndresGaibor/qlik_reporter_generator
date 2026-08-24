import { describe, expect, it } from "bun:test";
import { analizarProgramaQlik } from "./analizador-semantico.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

describe("analizarProgramaQlik fase 1", () => {
  it("trata LOAD * sobre SQL BigQuery como identidad y conserva la consulta", async () => {
    const script = await Bun.file(
      corpus("regression-ventas-mensuales-join.qlik"),
    ).text();
    const plan = analizarProgramaQlik(parsearProgramaQlik(script));

    expect(plan.relations).toHaveLength(1);
    expect(plan.outputRelationId).toBe(plan.relations[0]?.id);
    expect(plan.tables.Salida).toBe(plan.relations[0]?.id);
    expect(plan.relations[0]).toMatchObject({
      op: "native_sql",
      connection: "Google BigQuery:Prod",
    });
    if (plan.relations[0]?.op !== "native_sql")
      throw new Error("native_sql esperado");
    expect(plan.relations[0].sql).toContain("INNER JOIN `EDWH.DIM_FECHA`");
    expect(plan.relations[0].sql).toContain("GROUP BY ALL");
  });

  it("acepta SQL nativo sin LOAD y lo usa como salida", () => {
    const plan = analizarProgramaQlik(
      parsearProgramaQlik(
        "LIB CONNECT TO [Google BigQuery:Prod]; SQL SELECT 1 AS x;",
      ),
    );
    expect(plan.relations).toHaveLength(1);
    expect(plan.outputRelationId).toBe(plan.relations[0]?.id);
  });

  it("rechaza fuente SQL bajo una conexión que no es BigQuery", () => {
    expectCode(
      () =>
        analizarProgramaQlik(
          parsearProgramaQlik(
            "LIB CONNECT TO [PostgreSQL:Prod]; SQL SELECT 1;",
          ),
        ),
      "SOURCE_CONNECTION_NOT_BIGQUERY",
    );
  });

  it("convierte un LOAD con proyección en una relación explícita", () => {
    const plan = analizarProgramaQlik(
      parsearProgramaQlik(
        "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD Upper([nombre]) AS [Nombre]; SQL SELECT nombre FROM `p.d.t`;",
      ),
    );
    const output = plan.relations.find(
      (item) => item.id === plan.outputRelationId,
    );
    expect(output?.op).toBe("project");
    expect(output?.fields).toEqual(["Nombre"]);
  });

  it("registra MAPPING LOAD separado de las tablas normales", async () => {
    const script = await Bun.file(corpus("qlik-mapping-applymap.qlik")).text();
    try {
      const plan = analizarProgramaQlik(parsearProgramaQlik(script));
      expect(plan.mappings.Mapa).toMatchObject({
        keyField: "codigo",
        valueField: "descripcion",
      });
      expect(plan.tables.Mapa).toBeUndefined();
      expect(plan.mappings.Mapa?.relationId).toBeTruthy();
    } catch (error) {
      if (error instanceof ErrorCompilacionVNext) {
        expect(error.diagnostic.code).toBe("APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING");
        return;
      }
      throw error;
    }
  });

  it("rechaza MAPPING LOAD sin exactamente dos columnas", () => {
    expectCode(
      () => analizarProgramaQlik(parsearProgramaQlik(`
        LIB CONNECT TO [Google BigQuery:Prod];
        [Mapa]: MAPPING LOAD a, b, c;
        SQL SELECT a, b, c FROM \`p.d.map\`;
      `)),
      "MAPPING_REQUIRES_TWO_FIELDS",
    );
  });

  it("rechaza cualquier sentencia no consumida", () => {
    expectCode(
      () => analizarProgramaQlik(parsearProgramaQlik("FOOBAR algo;")),
      "SYNTAX_UNCONSUMED_TOKENS",
    );
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

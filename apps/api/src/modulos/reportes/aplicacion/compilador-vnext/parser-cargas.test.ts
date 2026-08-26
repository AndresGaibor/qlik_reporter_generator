import { describe, expect, it } from "bun:test";
import { parsearCuerpoLoad } from "./parser-carga.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function fixture(name: string) {
  return parsearProgramaQlik(await Bun.file(corpus(name)).text());
}

describe("prefijos LOAD vNext", () => {
  it.each([
    ["qlik-inner-join.qlik", { type: "join", join: "inner", target: "A" }],
    ["qlik-left-join.qlik", { type: "join", join: "left", target: "A" }],
    ["qlik-right-join.qlik", { type: "join", join: "right", target: "A" }],
    ["qlik-full-join.qlik", { type: "join", join: "full", target: "A" }],
    ["qlik-outer-join.qlik", { type: "join", join: "full", target: "A" }],
    ["qlik-concatenate.qlik", { type: "concatenate", target: "A" }],
    ["qlik-inner-keep.qlik", { type: "keep", keep: "inner", target: "A" }],
    ["qlik-left-keep.qlik", { type: "keep", keep: "left", target: "A" }],
    ["qlik-right-keep.qlik", { type: "keep", keep: "right", target: "A" }],
  ])("reconoce prefijo en %s", async (name, expected) => {
    const program = await fixture(name);
    const load = program.statements.find(
      (item) => item.type === "load" && item.prefix.type !== "none",
    );
    expect(load?.type).toBe("load");
    if (load?.type !== "load") throw new Error("load esperado");
    expect(load.prefix).toMatchObject(expected);
  });

  it("no acepta OUTER KEEP como KEEP válido", () => {
    const program = parsearProgramaQlik(`
      [A]: LOAD id; SELECT id FROM \`p.d.a\`;
      OUTER KEEP([A]) LOAD id; SELECT id FROM \`p.d.b\`;
    `);
    const statement = program.statements.find(
      (item) => item.type === "unsupported" && item.keyword === "OUTER",
    );
    expect(statement).toBeDefined();
  });

  it("reconoce NoConcatenate después del label", async () => {
    const program = await fixture("qlik-noconcatenate.qlik");
    const load = program.statements.find(
      (item) => item.type === "load" && item.label === "B",
    );
    expect(load?.type).toBe("load");
    if (load?.type !== "load") throw new Error("load esperado");
    expect(load.prefix).toEqual({ type: "noconcatenate" });
  });

  it("reconoce MAPPING como prefijo de LOAD después del label", async () => {
    const program = await fixture("qlik-mapping-applymap.qlik");
    const load = program.statements.find(
      (item) => item.type === "load" && item.label === "Mapa",
    );
    expect(load?.type).toBe("load");
    if (load?.type !== "load") throw new Error("load esperado");
    expect(load.prefix).toEqual({ type: "mapping" });
  });

  it("reconoce Crosstable, Generic y First", async () => {
    const cross = (await fixture("qlik-crosstable.qlik")).statements.find(
      (item) => item.type === "load",
    );
    const generic = (await fixture("qlik-generic-load.qlik")).statements.find(
      (item) => item.type === "load",
    );
    const first = (await fixture("qlik-first-sample.qlik")).statements.find(
      (item) => item.type === "load",
    );
    if (
      cross?.type !== "load" ||
      generic?.type !== "load" ||
      first?.type !== "load"
    ) {
      throw new Error("loads esperados");
    }
    expect(cross.prefix).toEqual({
      type: "crosstable",
      attributeField: "Mes",
      dataField: "Venta",
      qualifierFields: 1,
    });
    expect(generic.prefix).toEqual({ type: "generic" });
    expect(first.prefix).toEqual({ type: "first", limitExpression: "10" });
    expect(first.label).toBe("Salida");
  });
});

describe("parsearCuerpoLoad", () => {
  it("separa campos, WHERE, RESIDENT, GROUP BY y ORDER BY sin romper funciones", () => {
    const spec = parsearCuerpoLoad(
      "categoria, If(Sum(monto)>0, 'A,B', 'C') AS [Nivel], Sum(monto) AS Total RESIDENT [Base] WHERE monto > 0 GROUP BY categoria ORDER BY Total DESC",
    );
    expect(spec.resident).toBe("Base");
    expect(spec.where).toBe("monto > 0");
    expect(spec.groupBy).toEqual(["categoria"]);
    expect(spec.orderBy).toEqual([{ expression: "Total", direction: "desc" }]);
    expect(spec.fields).toEqual([
      { expression: "categoria", alias: "categoria" },
      { expression: "If(Sum(monto)>0, 'A,B', 'C')", alias: "Nivel" },
      { expression: "Sum(monto)", alias: "Total" },
    ]);
  });

  it("extrae WHERE de un preceding LOAD que recibe SQL después", () => {
    const spec = parsearCuerpoLoad(
      "id, Upper(categoria) AS Categoria, monto WHERE monto > 0",
    );
    expect(spec.resident).toBeUndefined();
    expect(spec.where).toBe("monto > 0");
    expect(spec.fields.map((field) => field.alias)).toEqual([
      "id",
      "Categoria",
      "monto",
    ]);
  });
});

import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

describe("metadata inter-record compile-time de Qlik", () => {
  it("resuelve valores distintos y LookUp sobre una INLINE previa ordenada", () => {
    const result = compilarDataflowVNext(`
      [Base]: LOAD * INLINE [
        id, nombre
        1, Ana
        2, Luis
        2, Luis
      ];
      [Salida]: LOAD
        FieldValueCount('nombre') AS cantidad,
        FieldValue('nombre', 2) AS segundo,
        FieldIndex('nombre', 'Luis') AS indice,
        LookUp('nombre', 'id', 2, 'Base') AS encontrado
      AUTOGENERATE 1;
    `);

    expect(result.sql).toContain("2 AS `cantidad`");
    expect(result.sql).toContain("'Luis' AS `segundo`");
    expect(result.sql).toContain("2 AS `indice`");
    expect(result.sql).toContain("'Luis' AS `encontrado`");
  });

  it("no inventa orden o alcance de chart para metadata inter-record", () => {
    expect(() =>
      compilarDataflowVNext(`
        LIB CONNECT TO [Google BigQuery:Prod];
        [Base]: LOAD nombre;
        SQL SELECT nombre FROM \`p.d.base\`;
        [Salida]: LOAD FieldValue('nombre', 1) AS valor AUTOGENERATE 1;
      `),
    ).toThrowError(ErrorCompilacionVNext);
    try {
      compilarDataflowVNext(`
        [Salida]: LOAD LookUp('nombre', 'id', 1) AS valor AUTOGENERATE 1;
      `);
    } catch (error) {
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "INTER_RECORD_SCOPE_UNSUPPORTED",
      );
    }
  });
});

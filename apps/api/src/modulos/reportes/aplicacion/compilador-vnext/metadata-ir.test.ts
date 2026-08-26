import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import type { PlanCompilacionVNext } from "./ir.js";
import { enriquecerPlanConMetadataBigQuery } from "./metadata-ir.js";

const fuente = (type: string) => ({
  tableId: "p.d.ventas",
  fields: {
    Fecha: { type, mode: "REQUIRED" as const },
    Cantidad: { type: "NUMERIC", mode: "NULLABLE" as const },
  },
});

describe("metadata BigQuery por relación en el IR", () => {
  it("usa sourceMetadata sin depender del mapa global fieldTypes", () => {
    const result = compilarDataflowVNext(
      `LIB CONNECT TO [Google BigQuery:Prod];
       [Base]: LOAD Fecha, Cantidad;
       SQL SELECT Fecha, Cantidad FROM \`p.d.ventas\`;
       [Salida]: LOAD Year(Fecha) AS Anio, Cantidad RESIDENT [Base];`,
      { sourceMetadata: { "p.d.ventas": fuente("DATE") } },
    );
    expect(result.sql).toContain("EXTRACT(YEAR FROM `Fecha`) AS `Anio`");
    expect(result.sql).not.toContain("EXTRACT(YEAR FROM COALESCE(");
  });

  it("mantiene tipos separados cuando dos fuentes comparten el mismo nombre", () => {
    const span = {
      start: 0,
      end: 0,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    };
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT Fecha FROM `p.d.a`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
        {
          id: "r2",
          op: "native_sql",
          sql: "SELECT Fecha FROM `p.d.b`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "r2",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: { Fecha: { type: "DATE", mode: "REQUIRED" } },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: { Fecha: { type: "STRING", mode: "NULLABLE" } },
      },
    });
    expect(result.relations[0]?.fieldMetadata?.Fecha?.type).toBe("DATE");
    expect(result.relations[1]?.fieldMetadata?.Fecha?.type).toBe("STRING");
  });

  it("conserva el tipo físico cuando SQL renombra una columna", () => {
    const result = compilarDataflowVNext(
      `LIB CONNECT TO [Google BigQuery:Prod];
       [Base]: LOAD Fecha;
       SQL SELECT NOM_FEC AS Fecha FROM \`p.d.dim_fecha\`;
       [Salida]: LOAD Year(Fecha) AS Anio RESIDENT [Base];`,
      {
        sourceMetadata: {
          "p.d.dim_fecha": {
            tableId: "p.d.dim_fecha",
            fields: { NOM_FEC: { type: "DATE", mode: "REQUIRED" } },
          },
        },
      },
    );
    expect(result.sql).toContain("EXTRACT(YEAR FROM `Fecha`) AS `Anio`");
    expect(result.sql).not.toContain("EXTRACT(YEAR FROM COALESCE(");
  });
});

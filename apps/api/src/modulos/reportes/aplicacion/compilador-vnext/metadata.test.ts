import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

describe("metadata de tablas Qlik", () => {
  it("resuelve funciones de tabla contra una relación INLINE previa", () => {
    const result = compilarDataflowVNext(`
      [Base]: LOAD * INLINE [
        id, nombre
        1, Ana
        2, Luis
      ];
      [Salida]: LOAD
        FieldName(1, 'Base') AS primer_campo,
        FieldNumber('nombre', 'Base') AS numero_nombre,
        NoOfFields('Base') AS campos,
        NoOfRows('Base') AS filas,
        NoOfTables() AS tablas,
        TableName(0) AS primera_tabla,
        TableNumber('Base') AS numero_tabla
      AUTOGENERATE 1;
    `);

    expect(result.sql).toContain("'id' AS `primer_campo`");
    expect(result.sql).toContain("2 AS `numero_nombre`");
    expect(result.sql).toContain("2 AS `campos`");
    expect(result.sql).toContain("2 AS `filas`");
    expect(result.sql).toContain("2 AS `tablas`");
    expect(result.sql).toContain("'Base' AS `primera_tabla`");
    expect(result.sql).toContain("0 AS `numero_tabla`");
  });

  it("mantiene diagnósticos estables cuando el esquema o las filas no son demostrables", () => {
    expect(() =>
      compilarDataflowVNext(`
      [Salida]: LOAD NoOfFields('Desconocida') AS campos AUTOGENERATE 1;
    `),
    ).toThrowError(ErrorCompilacionVNext);
    try {
      compilarDataflowVNext(`
        LIB CONNECT TO [Google BigQuery:Prod];
        [Salida]: LOAD NoOfRows('Base') AS filas;
        SQL SELECT id FROM \`p.d.base\`;
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "TABLE_METADATA_UNAVAILABLE",
      );
    }
  });
});

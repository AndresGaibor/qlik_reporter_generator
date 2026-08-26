import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

describe("MapSubstring Qlik", () => {
  it("preserva reemplazo case-sensitive de izquierda a derecha sin iterar", () => {
    const result = compilarDataflowVNext(`
      [Mapa]: MAPPING LOAD * INLINE [
        codigo, texto
        1, uno
        11, once
        A, alpha
      ];
      [Salida]: LOAD MapSubstring('Mapa', codigo) AS reemplazo INLINE [
        codigo
        11A
        1a
      ];
    `);

    expect(result.sql).toContain("WITH RECURSIVE");
    expect(result.sql).toContain("SUBSTR(");
    expect(result.sql).toContain(
      "ORDER BY LENGTH(__qlik_map_substring_map_substring_key)",
    );
    expect(result.sql).not.toContain("COLLATE");
  });

  it("falla explícitamente si el orden del mapping no puede probarse", () => {
    try {
      compilarDataflowVNext(`
        LIB CONNECT TO [Google BigQuery:Prod];
        [Mapa]: MAPPING LOAD codigo, texto;
        SQL SELECT codigo, texto FROM \`p.d.mapa\`;
        [Salida]: LOAD MapSubstring('Mapa', codigo) AS reemplazo;
        SQL SELECT codigo FROM \`p.d.entrada\`;
      `);
      throw new Error("debió fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "MAPSUBSTRING_MAPPING_ORDER_UNPROVEN",
      );
    }
  });
});

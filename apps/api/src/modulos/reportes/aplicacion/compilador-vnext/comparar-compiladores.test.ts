import { describe, expect, it } from "bun:test";
import { compararCompiladores } from "./comparar-compiladores.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

describe("compararCompiladores", () => {
  it("hace visible la divergencia del JOIN perdido por legacy", async () => {
    const script = await Bun.file(
      corpus("regression-ventas-mensuales-join.qlik"),
    ).text();
    const comparison = compararCompiladores(script);

    expect(comparison.legacy.status).toBe("compiled");
    expect(comparison.vnext.status).toBe("compiled");
    if (
      comparison.legacy.status !== "compiled" ||
      comparison.vnext.status !== "compiled"
    ) {
      throw new Error("ambos deben compilar para comparar");
    }
    expect(comparison.legacy.sql).not.toContain("INNER JOIN `EDWH.DIM_FECHA`");
    expect(comparison.vnext.sql).toContain("INNER JOIN `EDWH.DIM_FECHA`");
    expect(comparison.sameNormalizedSql).toBe(false);
  });

  it("expone rechazo vNext y nunca selecciona legacy como fallback", () => {
    const comparison = compararCompiladores(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [x]: LOAD ApplyMap('m', [id]) AS [nombre];
      SQL SELECT id FROM \`p.d.t\`;
    `);

    expect(comparison.vnext.status).toBe("rejected");
    expect(comparison).not.toHaveProperty("selectedSql");
    if (comparison.vnext.status === "rejected") {
      expect(comparison.vnext.code).toBe("APPLYMAP_MAPPING_NOT_FOUND");
    }
  });
});

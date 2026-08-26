import { describe, expect, it } from "bun:test";
import manifest from "../../fixtures/compiler-corpus/coverage-manifest.json";
import { generarReporteCoberturaFunciones } from "./reporte-cobertura.js";

describe("reporte de cobertura de funciones vNext", () => {
  it("cuadra exactamente con el inventario contractual", () => {
    const report = generarReporteCoberturaFunciones();
    expect(report.total).toBe(manifest.counts.qlik_function);
    expect(report.runtime.implemented + report.runtime.tracked).toBe(
      report.total,
    );
    expect(
      report.certification.unverified +
        report.certification.certified +
        report.certification.non_equivalent,
    ).toBe(report.total);
    expect(report.functions).toHaveLength(report.total);
  });

  it("mantiene las variantes regex case-insensitive documentadas por Qlik", () => {
    const names = new Set(
      generarReporteCoberturaFunciones().functions.map((entry) => entry.name),
    );
    for (const name of [
      "CountRegExI",
      "ExtractRegExI",
      "ExtractRegExGroupI",
      "IndexRegExI",
      "IndexRegExGroupI",
      "IsRegExI",
      "MatchRegExI",
      "ReplaceRegExI",
      "ReplaceRegExGroupI",
      "SubFieldRegExI",
    ])
      expect(names.has(name)).toBe(true);
  });

  it("no confunde implementación con certificación", () => {
    const report = generarReporteCoberturaFunciones();
    expect(report.runtime.implemented).toBeGreaterThan(0);
    expect(report.certification.certified).toBe(0);
    expect(report.supported).toBe(0);
  });
});

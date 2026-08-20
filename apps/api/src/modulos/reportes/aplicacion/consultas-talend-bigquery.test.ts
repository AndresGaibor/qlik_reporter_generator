import { describe, expect, it } from "bun:test";
import { construirConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";

const entrada = {
  sql: "SELECT Fecha, Venta_Neta_USD FROM `poc-bigquery-talend.demo_lafavorita.VENTAS_COMERCIAL_DIARIAS_D` WHERE Fecha = DATE '2026-06-01'",
  uriBase:
    "gs://bkt_dwh/POCs/TalendDescargados/ventas/410c97de-5802-4576-aa71-8dc8ee2d4499/",
  projectId: "poc-bigquery-talend",
  dataset: "demo_lafavorita",
  ejecucionId: "410c97de-5802-4576-aa71-8dc8ee2d4499",
};

describe("construirConsultasTalendBigQuery", () => {
  it("genera las dos consultas directas que espera el Job actual", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);

    expect(consultas.bqNumberCsv).toContain("GENERATE_ARRAY");
    expect(consultas.bqNumberCsv).toContain("[0]");
    expect(consultas.bqNumberCsv).toContain("Fecha = DATE '2026-06-01'");
    expect(consultas.bqExportData).toContain("parte-__PART_PADDED__-*.csv.gz");
    expect(consultas.bqExportData).toContain(
      "DIV(export_row_number - 1, 1000000) = __PART__",
    );
    expect(consultas.bqExportData).toContain("compression = 'GZIP'");
    expect(consultas.bqExportData).toContain("__finalizado__-*.csv.gz");
    expect(consultas.bqExportData).toContain("SELECT 'ok' AS estado");
    expect(consultas.bqExportData).not.toContain("CREATE OR REPLACE TABLE");
    expect(consultas.bqExportData).not.toContain("DROP TABLE");
  });

  it("no crea ni consulta tablas temporales", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);
    expect(consultas.bqNumberCsv).not.toContain("__qlik_reportes_");
    expect(consultas.bqExportData).not.toContain("__qlik_reportes_");
  });

  it("mantiene el máximo Excel en 1.000.000 y rechaza entradas inseguras", () => {
    expect(() =>
      construirConsultasTalendBigQuery({
        ...entrada,
        maximoFilasPorArchivo: 1_000_001,
      }),
    ).toThrow("1.000.000");
    expect(() =>
      construirConsultasTalendBigQuery({
        ...entrada,
        uriBase: "https://example.com/out",
      }),
    ).toThrow("GCS");
    expect(() =>
      construirConsultasTalendBigQuery({
        ...entrada,
        ejecucionId: "x'; DROP TABLE y;--",
      }),
    ).toThrow("ejecución");
  });
});

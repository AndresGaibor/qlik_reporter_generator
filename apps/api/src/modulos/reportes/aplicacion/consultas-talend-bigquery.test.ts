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
  it("genera las cuatro consultas que espera el Job Prueba_BigQuery", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);

    expect(consultas.bqSelectData).toContain("CREATE OR REPLACE TABLE");
    expect(consultas.bqSelectData).toContain(
      "DIV(export_row_number - 1, 1000000) AS export_part",
    );
    expect(consultas.bqSelectData).toContain("Fecha = DATE '2026-06-01'");
    expect(consultas.bqNumberCsv).toContain("SELECT DISTINCT export_part");
    expect(consultas.bqExportData).toContain("parte-__PART_PADDED__-*.csv.gz");
    expect(consultas.bqExportData).toContain("WHERE export_part = __PART__");
    expect(consultas.bqExportData).toContain("compression = 'GZIP'");
    expect(consultas.bqDrop).toContain("DROP TABLE IF EXISTS");
    expect(consultas.bqDrop).toContain("__finalizado__-*.csv.gz");
    expect(consultas.bqDrop).toContain("SELECT 'ok' AS estado");
  });

  it("usa una staging única por ejecución dentro del proyecto y dataset configurados", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);
    const staging =
      "`poc-bigquery-talend.demo_lafavorita.__qlik_reportes_410c97de_5802_4576_aa71_8dc8ee2d4499`";

    expect(consultas.bqSelectData).toContain(staging);
    expect(consultas.bqNumberCsv).toContain(staging);
    expect(consultas.bqExportData).toContain(staging);
    expect(consultas.bqDrop).toContain(staging);
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

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
  it("genera el SQL principal como un único EXPORT DATA gzip delimitado por pipe", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);

    expect(consultas.sql.match(/EXPORT DATA/gi)?.length).toBe(1);
    expect(consultas.sql).toContain("parte-*.csv.gz");
    expect(consultas.sql).toContain("compression = 'GZIP'");
    expect(consultas.sql).toContain("field_delimiter = '|'");
    expect(consultas.sql).toContain("Fecha = DATE '2026-06-01'");
    expect(consultas.sql).not.toContain("GENERATE_ARRAY");
    expect(consultas.sql).not.toContain("ROW_NUMBER");
    expect(consultas.sql).not.toContain("__PART_PADDED__");
    expect(consultas.sql).not.toContain("__finalizado__");
  });

  it("expone únicamente el contrato moderno", () => {
    const consultas = construirConsultasTalendBigQuery(entrada);

    expect(Object.keys(consultas).sort()).toEqual([
      "jobId",
      "projectId",
      "sql",
    ]);
  });

  it("rechaza entradas inseguras", () => {
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

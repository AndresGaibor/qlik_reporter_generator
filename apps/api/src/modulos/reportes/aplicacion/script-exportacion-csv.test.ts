import { describe, expect, it } from "bun:test";
import {
  MAXIMO_FILAS_EXCEL,
  construirScriptExportacionCsv,
} from "./script-exportacion-csv.js";

const uriBase = "gs://bkt_dwh/POCs/TalendDescargados/reporte/ejecucion";

describe("construirScriptExportacionCsv", () => {
  it("usa un millón de filas como máximo por bloque lógico", () => {
    expect(MAXIMO_FILAS_EXCEL).toBe(1_000_000);
    expect(() =>
      construirScriptExportacionCsv({
        sql: "SELECT 1 AS id",
        uriBase,
        maximoFilasPorArchivo: 1_000_001,
      }),
    ).toThrow("1.000.000");
    expect(() =>
      construirScriptExportacionCsv({ sql: "SELECT 1", uriBase, maximoFilasPorArchivo: 0 }),
    ).toThrow();
  });

  it.each([1, 999_999, 1_000_000])("acepta bloque de %i filas", (maximoFilasPorArchivo) => {
    const script = construirScriptExportacionCsv({
      sql: "SELECT * FROM `p.d.t`",
      uriBase,
      maximoFilasPorArchivo,
    });
    expect(script).toContain(`DECLARE max_rows INT64 DEFAULT ${maximoFilasPorArchivo};`);
  });

  it("genera particiones, CSV GZIP y nombres parte-001", () => {
    const script = construirScriptExportacionCsv({ sql: "SELECT * FROM `p.d.t`", uriBase });
    expect(script).toContain("DECLARE max_rows INT64 DEFAULT 1000000;");
    expect(script).toContain("DIV(__reportes_export_row_number - 1, max_rows)");
    expect(script).toContain("parte-%s-*.csv.gz");
    expect(script).toContain("LPAD(CAST(current_part + 1 AS STRING), 3, '0')");
    expect(script).toContain("compression = 'GZIP'");
    expect(script).toContain("format = 'CSV'");
    expect(script).toContain("header = true");
    expect(script).toContain("field_delimiter = '|'");
    expect(script).toContain("SELECT * EXCEPT (__reportes_export_row_number, __reportes_export_part)");
  });

  it("preserva un orden explícito mediante ROW_NUMBER", () => {
    const script = construirScriptExportacionCsv({
      sql: "SELECT Fecha, Id FROM `p.d.t`",
      uriBase: `${uriBase}/`,
      columnasOrden: ["Fecha", "Id"],
    });
    expect(script).toContain("ROW_NUMBER() OVER (ORDER BY `Fecha`, `Id`)");
    expect(script).toContain(`uri = '${uriBase}/parte-%s-*.csv.gz'`);
    expect(script).not.toContain(`${uriBase}//parte-`);
  });

  it("rechaza destinos que no sean GCS e identificadores de orden inseguros", () => {
    expect(() => construirScriptExportacionCsv({ sql: "SELECT 1", uriBase: "sftp://host/out" })).toThrow("GCS");
    expect(() => construirScriptExportacionCsv({ sql: "SELECT 1", uriBase, columnasOrden: ["Fecha; DROP"] })).toThrow("orden");
  });
});

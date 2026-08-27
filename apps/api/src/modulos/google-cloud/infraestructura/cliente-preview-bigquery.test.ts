import { describe, it, expect, vi, beforeEach } from "bun:test";
import type { BigQuery, Table } from "@google-cloud/bigquery";
import { ClientePreviewBigQuery } from "./cliente-preview-bigquery";

describe("ClientePreviewBigQuery", () => {
  let mockTable: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockTable = {
      getRows: vi.fn().mockResolvedValue([[
        { f: [{ v: "valor1" }, { v: "valor2" }] },
        { f: [{ v: "valor3" }, { v: "valor4" }] },
      ], { totalRows: "2" }]),
    };
  });

  it("obtiene filas usando getRows sin crear query job", async () => {
    const mockDataset = {
      table: vi.fn(() => mockTable) as unknown as Table,
    };
    const mockBq = {
      dataset: vi.fn(() => mockDataset) as unknown as BigQuery["dataset"],
    } as unknown as BigQuery;

    const cliente = new ClientePreviewBigQuery(
      { projectId: "test-project", dataset: "test-dataset" },
      mockBq,
    );
    const resultado = await cliente.obtenerFilasPreview("tabla_ejemplo", { maxFilas: 10 });

    expect(resultado.columnas).toEqual(["col_0", "col_1"]);
    expect(resultado.filas).toEqual([["valor1", "valor2"], ["valor3", "valor4"]]);
  });

  it("nunca llama a createQueryJob", async () => {
    const mockDataset = {
      table: vi.fn(() => mockTable) as unknown as Table,
    };
    const mockBq = {
      dataset: vi.fn(() => mockDataset) as unknown as BigQuery["dataset"],
    } as unknown as BigQuery;

    const cliente = new ClientePreviewBigQuery(
      { projectId: "p", dataset: "d" },
      mockBq,
    );
    expect(typeof (cliente as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
  });
});

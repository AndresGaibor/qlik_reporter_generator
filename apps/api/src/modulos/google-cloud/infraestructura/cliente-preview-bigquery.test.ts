import { beforeEach, describe, expect, it, vi } from "bun:test";
import type { BigQuery, Table } from "@google-cloud/bigquery";
import { ClientePreviewBigQuery } from "./cliente-preview-bigquery";

describe("ClientePreviewBigQuery", () => {
  let mockTable: {
    getMetadata: ReturnType<typeof vi.fn>;
    getRows: ReturnType<typeof vi.fn>;
  };
  let mockBq: BigQuery;
  let mockDataset: { table: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTable = {
      getMetadata: vi.fn().mockResolvedValue([
        {
          schema: {
            fields: [
              { name: "id", type: "INT64", mode: "REQUIRED" },
              { name: "nombre", type: "STRING", mode: "NULLABLE" },
              { name: "fecha", type: "DATE", mode: "NULLABLE" },
            ],
          },
        },
      ]),
      getRows: vi
        .fn()
        .mockRejectedValue(new Error("getRows no debe ejecutarse")),
    };
    mockDataset = {
      table: vi.fn(() => mockTable as unknown as Table),
    };
    mockBq = {
      dataset: vi.fn(() => mockDataset) as unknown as BigQuery["dataset"],
      query: vi.fn().mockRejectedValue(new Error("query no debe ejecutarse")),
      createQueryJob: vi
        .fn()
        .mockRejectedValue(new Error("createQueryJob no debe ejecutarse")),
    } as unknown as BigQuery;
  });

  it("expone una lectura HEAD separada de metadata", () => {
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "test-project", dataset: "test-dataset" },
      mockBq,
    );

    expect(
      typeof (cliente as unknown as { obtenerFilasPreview?: unknown })
        .obtenerFilasPreview,
    ).toBe("function");
  });

  it("lee HEAD con table.getRows, máximo 5, sin query jobs", async () => {
    mockTable.getRows = vi.fn().mockResolvedValue([
      [
        { id: 101, nombre: "Proveedor Real", fecha: { value: "2026-07-01" } },
        { id: 102, nombre: "Bodega Real", fecha: { value: "2026-07-02" } },
      ],
    ]);
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "test-project", dataset: "test-dataset" },
      mockBq,
    );
    const lector = cliente as unknown as {
      obtenerFilasPreview?: (
        tabla: string,
        opciones: { maxFilas: number; columnas?: string[] },
      ) => Promise<{ columnas: string[]; filas: string[][] }>;
    };

    const resultado = await lector.obtenerFilasPreview?.("tabla_ejemplo", {
      maxFilas: 5,
      columnas: ["id", "nombre", "fecha"],
    });

    expect(mockTable.getRows).toHaveBeenCalledWith({
      autoPaginate: false,
      maxResults: 5,
      selectedFields: "id,nombre,fecha",
    });
    expect(resultado).toEqual({
      columnas: ["id", "nombre", "fecha"],
      filas: [
        ["101", "Proveedor Real", "2026-07-01"],
        ["102", "Bodega Real", "2026-07-02"],
      ],
    });
    expect(mockBq.query).not.toHaveBeenCalled();
    expect(mockBq.createQueryJob).not.toHaveBeenCalled();
  });

  it("obtiene exclusivamente metadata estructural de la tabla", async () => {
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "test-project", dataset: "test-dataset" },
      mockBq,
    );

    await expect(
      cliente.obtenerMetadataTabla("tabla_ejemplo"),
    ).resolves.toEqual({
      columnas: [
        { nombre: "id", tipo: "INT64", modo: "REQUIRED" },
        { nombre: "nombre", tipo: "STRING", modo: "NULLABLE" },
        { nombre: "fecha", tipo: "DATE", modo: "NULLABLE" },
      ],
    });

    expect(mockTable.getMetadata).toHaveBeenCalledTimes(1);
    expect(mockTable.getRows).not.toHaveBeenCalled();
    expect(mockBq.query).not.toHaveBeenCalled();
    expect(mockBq.createQueryJob).not.toHaveBeenCalled();
  });

  it("filtra metadata de columnas sin leer filas", async () => {
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "test-project", dataset: "test-dataset" },
      mockBq,
    );

    const resultado = await cliente.obtenerMetadataTabla("tabla_ejemplo", {
      columnas: ["fecha", "nombre"],
    });

    expect(resultado.columnas.map((columna) => columna.nombre)).toEqual([
      "fecha",
      "nombre",
    ]);
    expect(mockTable.getRows).not.toHaveBeenCalled();
  });

  it("usa el proyecto incluido en una tabla calificada", async () => {
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "proyecto-configurado", dataset: "dataset-configurado" },
      mockBq,
    );

    await cliente.obtenerMetadataTabla("proyecto-fuente.dataset-fuente.tabla");

    expect(mockBq.dataset).toHaveBeenCalledWith("dataset-fuente", {
      projectId: "proyecto-fuente",
    });
    expect(mockDataset.table).toHaveBeenCalledWith("tabla");
  });

  it("soporta dataset.tabla y tabla usando el dataset configurado", async () => {
    const cliente = ClientePreviewBigQuery.createConCliente(
      { projectId: "proyecto-configurado", dataset: "dataset-configurado" },
      mockBq,
    );

    await cliente.obtenerMetadataTabla("otro_dataset.tabla_a");
    await cliente.obtenerMetadataTabla("tabla_b");

    expect(mockBq.dataset).toHaveBeenNthCalledWith(
      1,
      "otro_dataset",
      undefined,
    );
    expect(mockBq.dataset).toHaveBeenNthCalledWith(
      2,
      "dataset-configurado",
      undefined,
    );
  });
});

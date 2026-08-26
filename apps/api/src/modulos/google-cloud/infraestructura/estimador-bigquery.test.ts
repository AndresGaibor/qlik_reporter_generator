import { describe, expect, it, vi } from "vitest";
import { EstimadorBigQuery } from "./estimador-bigquery.js";

describe("EstimadorBigQuery", () => {
  it("lee metadata rica de esquema, particion y clustering", async () => {
    const getMetadata = vi.fn(async () => [
      {
        numBytes: "987654",
        schema: {
          fields: [
            { name: "Fecha", type: "DATE", mode: "REQUIRED" },
            {
              name: "Monto",
              type: "NUMERIC",
              mode: "NULLABLE",
              precision: "20",
              scale: "4",
            },
            {
              name: "Detalle",
              type: "RECORD",
              mode: "NULLABLE",
              fields: [{ name: "Codigo", type: "STRING", mode: "REQUIRED" }],
            },
          ],
        },
        timePartitioning: {
          type: "DAY",
          field: "Fecha",
          requirePartitionFilter: true,
        },
        clustering: { fields: ["Sucursal", "Categoria"] },
      },
    ]);
    const table = vi.fn(() => ({ getMetadata }));
    const dataset = vi.fn(() => ({ table }));
    const estimador = new EstimadorBigQuery({
      projectId: "proyecto",
      dataset: "dataset",
    }) as unknown as {
      cliente: { dataset: ReturnType<typeof vi.fn> };
      obtenerMetadataTabla(tabla: string): Promise<unknown>;
    };
    estimador.cliente = { dataset };

    await expect(
      estimador.obtenerMetadataTabla("otro-proyecto.EDWH_REP.VENTAS"),
    ).resolves.toMatchObject({
      tableId: "otro-proyecto.EDWH_REP.VENTAS",
      numBytes: 987654,
      fields: {
        Fecha: { type: "DATE", mode: "REQUIRED" },
        Monto: { type: "NUMERIC", mode: "NULLABLE", precision: 20, scale: 4 },
        Detalle: {
          type: "RECORD",
          mode: "NULLABLE",
          fields: { Codigo: { type: "STRING", mode: "REQUIRED" } },
        },
      },
      timePartitioning: {
        type: "DAY",
        field: "Fecha",
        requirePartitionFilter: true,
      },
      clusteringFields: ["Sucursal", "Categoria"],
    });
  });
  it("lee tipos reales del esquema de una tabla totalmente calificada", async () => {
    const getMetadata = vi.fn(async () => [
      {
        schema: {
          fields: [
            { name: "Fecha", type: "DATE" },
            { name: "Cantidad", type: "NUMERIC" },
          ],
        },
      },
    ]);
    const table = vi.fn(() => ({ getMetadata }));
    const dataset = vi.fn(() => ({ table }));
    const estimador = new EstimadorBigQuery({
      projectId: "proyecto",
      dataset: "dataset",
    }) as unknown as {
      cliente: { dataset: ReturnType<typeof vi.fn> };
      obtenerEsquemaTabla(tabla: string): Promise<Record<string, string>>;
    };
    estimador.cliente = { dataset };

    await expect(
      estimador.obtenerEsquemaTabla("otro-proyecto.EDWH_REP.VENTAS"),
    ).resolves.toEqual({ Fecha: "DATE", Cantidad: "NUMERIC" });
    expect(dataset).toHaveBeenCalledWith("EDWH_REP", {
      projectId: "otro-proyecto",
    });
    expect(table).toHaveBeenCalledWith("VENTAS");
  });

  it("propaga como validacion 422 un Access Denied del dry-run", async () => {
    const estimador = new EstimadorBigQuery({
      projectId: "proyecto",
      dataset: "dataset",
      credencialesJson: '{"type":"service_account"}',
    }) as unknown as {
      cliente: { createQueryJob: ReturnType<typeof vi.fn> };
      estimarConsulta(sql: string): Promise<unknown>;
    };
    estimador.cliente = {
      createQueryJob: vi.fn(async () => {
        throw new Error("Access Denied: Table otro:dataset.tabla");
      }),
    };

    await expect(estimador.estimarConsulta("SELECT 1")).rejects.toMatchObject({
      codigo: "BIGQUERY_VALIDACION_FALLIDA",
      estadoHttp: 422,
      message: expect.stringContaining("Access Denied"),
    });
  });
});

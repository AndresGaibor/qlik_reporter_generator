import { describe, expect, it, vi } from "vitest";
import { EstimadorBigQuery } from "./estimador-bigquery.js";

describe("EstimadorBigQuery", () => {
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

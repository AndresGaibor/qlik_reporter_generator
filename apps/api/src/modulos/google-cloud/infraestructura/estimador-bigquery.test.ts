import { describe, expect, it, vi } from "vitest";
import { EstimadorBigQuery } from "./estimador-bigquery.js";

describe("EstimadorBigQuery", () => {
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

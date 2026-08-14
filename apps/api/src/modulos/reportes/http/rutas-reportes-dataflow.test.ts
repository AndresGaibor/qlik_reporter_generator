import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import { crearRutasReportesDataflow } from "./rutas-reportes-dataflow.js";

const SCRIPT = `
LIB CONNECT TO [Google BigQuery:Produccion];
[x]: LOAD [id];
SQL SELECT id FROM \`p.d.t\`;
`;

describe("rutas reportes Dataflow", () => {
  it("expone preflight usando Qlik y BigQuery resueltos en servidor", async () => {
    const obtenerScriptApp = vi.fn(async () => ({ script: SCRIPT }));
    const estimarConsulta = vi.fn(async () => ({
      bytesProcesados: 42,
      costoEstimadoUsd: 0.001,
    }));
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({ obtenerScriptApp }),
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta },
          projectId: "p",
          dataset: "d",
        }),
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/dataflows/flujo-1/preflight",
    );
    const body = (await respuesta.json()) as {
      exito: boolean;
      datos: { compatible: boolean; bytesProcesados: number };
    };

    expect(respuesta.status).toBe(200);
    expect(body.exito).toBe(true);
    expect(body.datos.compatible).toBe(true);
    expect(body.datos.bytesProcesados).toBe(42);
    expect(obtenerScriptApp).toHaveBeenCalledWith("flujo-1", "current");
    expect(estimarConsulta).toHaveBeenCalledTimes(1);
  });
});

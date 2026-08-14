import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import {
  type AlcanceBigQueryReporte,
  type EstimadorBigQueryReporte,
  type LectorScriptDataflow,
  PreflightDataflow,
} from "../aplicacion/preflight-dataflow.js";

export type ResolucionBigQueryReporte = AlcanceBigQueryReporte & {
  estimador: EstimadorBigQueryReporte;
};

export interface DependenciasRutasReportesDataflow {
  resolverQlik(c: Context): Promise<LectorScriptDataflow>;
  resolverBigQuery(c: Context): Promise<ResolucionBigQueryReporte>;
}

export function crearRutasReportesDataflow(
  dependencias: DependenciasRutasReportesDataflow,
) {
  const rutas = new Hono();

  rutas.get("/dataflows/:flujoId/preflight", async (c) => {
    const flujoIdQlik = c.req.param("flujoId").trim();
    if (!flujoIdQlik) {
      return c.json(
        { exito: false, error: { mensaje: "El Dataflow es obligatorio" } },
        400,
      );
    }
    const [qlik, bigQuery] = await Promise.all([
      dependencias.resolverQlik(c),
      dependencias.resolverBigQuery(c),
    ]);
    const caso = new PreflightDataflow(qlik, bigQuery.estimador, {
      projectId: bigQuery.projectId,
      dataset: bigQuery.dataset,
    });
    return responderExito(c, await caso.ejecutar(flujoIdQlik));
  });

  return rutas;
}

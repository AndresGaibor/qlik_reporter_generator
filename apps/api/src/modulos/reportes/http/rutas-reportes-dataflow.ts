import { type Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import { ListarFlujos } from "../../flujos/aplicacion/casos-de-uso/listar-flujos.js";
import type { PuertoConsultaFlujos } from "../../flujos/aplicacion/puertos/puerto-consulta-flujos.js";
import {
  resumenScriptNoDisponible,
  resumirDataflowParaUsuario,
} from "../../flujos/aplicacion/resumir-dataflow.js";
import {
  type DependenciasClonadoDataflow,
  crearRutasClonadoDataflow,
} from "../../flujos/http/rutas-clonado-dataflow.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { EntradaEjecutarReporte } from "../aplicacion/ejecutar-reporte.js";
import {
  type AlcanceBigQueryReporte,
  type EstimadorBigQueryReporte,
  PreflightDataflow,
} from "../aplicacion/preflight-dataflow.js";
import type { PuertoRepositorioReportes } from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export type ResolucionBigQueryReporte = AlcanceBigQueryReporte & {
  estimador: EstimadorBigQueryReporte;
};
interface SesionReportes {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  usuarioIdQlik: string;
  usuarioCorreo?: string | null;
}

export interface DependenciasRutasReportesDataflow {
  resolverQlik(c: Context): Promise<PuertoQlik>;
  resolverConsultaFlujos(c: Context): Promise<PuertoConsultaFlujos>;
  resolverBigQuery(c: Context): Promise<ResolucionBigQueryReporte>;
  resolverSesion(c: Context): Promise<SesionReportes>;
  repositorioReportes: PuertoRepositorioReportes;
  resolverEjecutarReporte?: (
    c: Context,
  ) => Promise<
    (
      entrada: EntradaEjecutarReporte,
    ) => Promise<{ runId: string; ejecucionReporteId: string }>
  >;
  dependenciasClonado: DependenciasClonadoDataflow;
}

export function crearRutasReportesDataflow(
  dependencias: DependenciasRutasReportesDataflow,
) {
  const rutas = new Hono();
  rutas.route("/", crearRutasClonadoDataflow(dependencias.dependenciasClonado));
  const obtenerFlujo = async (c: Context) => {
    const flujoId = c.req.param("flujoId")?.trim() ?? "";
    const flujos = await (
      await dependencias.resolverConsultaFlujos(c)
    ).listar();
    return flujos.find((flujo) => flujo.id === flujoId);
  };

  rutas.get("/", async (c) => {
    const espacioId = c.req.query("espacioId")?.trim() || undefined;
    const q = (c.req.query("q") ?? c.req.query("busqueda"))
      ?.trim()
      .toLowerCase();
    let flujos = await new ListarFlujos(
      await dependencias.resolverConsultaFlujos(c),
    ).ejecutar(espacioId);
    if (q)
      flujos = flujos.filter((flujo) => flujo.nombre.toLowerCase().includes(q));
    return responderExito(c, flujos);
  });

  rutas.get("/:flujoId", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    return responderExito(c, flujo);
  });

  rutas.get("/:flujoId/resumen", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const qlik = await dependencias.resolverQlik(c);
    try {
      const { script } = await qlik.obtenerScriptApp(flujo.id, "current");
      const validacion = await qlik.validarScriptApp(script);
      return responderExito(
        c,
        resumirDataflowParaUsuario({
          flujoId: flujo.id,
          nombre: flujo.nombre,
          script,
          erroresQlik: validacion.errores.map(formatearValidacion),
          advertenciasQlik: validacion.advertencias.map(formatearValidacion),
        }),
      );
    } catch (error) {
      return responderExito(
        c,
        resumenScriptNoDisponible(
          flujo.id,
          flujo.nombre,
          error instanceof Error
            ? error.message
            : "No se pudo obtener el script desde Qlik Cloud",
        ),
      );
    }
  });

  rutas.get("/:flujoId/preflight", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const [qlik, bigQuery] = await Promise.all([
      dependencias.resolverQlik(c),
      dependencias.resolverBigQuery(c),
    ]);
    return responderExito(
      c,
      await new PreflightDataflow(qlik, bigQuery.estimador, {
        projectId: bigQuery.projectId,
        dataset: bigQuery.dataset,
      }).ejecutar(flujo.id),
    );
  });

  rutas.get("/:flujoId/ejecuciones", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const sesion = await dependencias.resolverSesion(c);
    const ejecuciones =
      await dependencias.repositorioReportes.listarEjecuciones(
        flujo.id,
        sesion.tenantId,
        sesion.organizacionId,
        100,
      );
    return responderExito(c, ejecuciones.map(serializarEjecucion));
  });

  rutas.post("/:flujoId/ejecuciones", async (c) => {
    if (!dependencias.resolverEjecutarReporte)
      throw new ErrorAplicacion(
        "EXECUTOR_NOT_CONFIGURED",
        "La ejecución de reportes no está configurada",
        500,
      );
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const sesion = await dependencias.resolverSesion(c);
    try {
      const ejecutar = await dependencias.resolverEjecutarReporte(c);
      return responderExito(
        c,
        await ejecutar({ flujoIdQlik: flujo.id, ...sesion }),
      );
    } catch (error) {
      return respuestaErrorAplicacion(c, error);
    }
  });
  return rutas;
}

function noEncontradoDataflow(c: Context) {
  return c.json(
    {
      exito: false,
      error: {
        codigo: "DATAFLOW_NO_ENCONTRADO",
        mensaje: "El Dataflow no está disponible en el tenant",
      },
    },
    404,
  );
}
function serializarEjecucion(
  ejecucion: Awaited<
    ReturnType<PuertoRepositorioReportes["listarEjecuciones"]>
  >[number],
) {
  return {
    ...ejecucion,
    ejecutadoPorUsuarioId: ejecucion.ejecutadoPorUsuarioId ?? null,
    automatizacionPersonalId: ejecucion.automatizacionPersonalId ?? null,
    runIdQlik: ejecucion.runIdQlik ?? null,
    flujoEspacioIdQlik: ejecucion.flujoEspacioIdQlik ?? null,
    iniciadoEn: ejecucion.iniciadoEn?.toISOString() ?? null,
    finalizadoEn: ejecucion.finalizadoEn?.toISOString() ?? null,
    creadoEn: (
      ejecucion.creadoEn ??
      ejecucion.iniciadoEn ??
      new Date(0)
    ).toISOString(),
  };
}
function respuestaErrorAplicacion(c: Context, error: unknown) {
  if (!(error instanceof ErrorAplicacion)) throw error;
  return c.json(
    {
      exito: false,
      error: {
        codigo: error.codigo,
        mensaje: error.message,
        detalles: error.detalles,
      },
    },
    error.estadoHttp as 400 | 401 | 404 | 409 | 422,
  );
}
function formatearValidacion(m: {
  mensaje: string;
  pestana?: number;
  linea?: number;
  columna?: number;
  informacion?: string;
}) {
  const ubicacion = [
    m.pestana !== undefined && `pestaña ${m.pestana}`,
    m.linea !== undefined && `línea ${m.linea}`,
    m.columna !== undefined && `columna ${m.columna}`,
  ].filter(Boolean);
  return `${m.mensaje}${ubicacion.length ? ` (${ubicacion.join(", ")})` : ""}${m.informacion ? `: ${m.informacion}` : ""}`;
}

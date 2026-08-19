import {
  esquemaActualizarConfiguracionReporte,
  esquemaCrearReporte,
} from "@qlik/contratos";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { ClonarReporte } from "../aplicacion/clonar-reporte.js";
import { CrearReporte } from "../aplicacion/crear-reporte.js";
import type { EntradaEjecutarReporte } from "../aplicacion/ejecutar-reporte.js";
import {
  type AlcanceBigQueryReporte,
  type EstimadorBigQueryReporte,
  PreflightDataflow,
} from "../aplicacion/preflight-dataflow.js";
import type { PuertoRepositorioReportes } from "../aplicacion/puertos/puerto-repositorio-reportes.js";
import { URI_BASE_GCS_REPORTES } from "../dominio/destino-gcs.js";

export type ResolucionBigQueryReporte = AlcanceBigQueryReporte & {
  estimador: EstimadorBigQueryReporte;
};

interface SesionReportes {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  usuarioIdQlik: string;
}

export interface DependenciasRutasReportesDataflow {
  resolverQlik(c: Context): Promise<PuertoQlik>;
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
}

export function crearRutasReportesDataflow(
  dependencias: DependenciasRutasReportesDataflow,
) {
  const rutas = new Hono();

  rutas.get("/", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const reportes = await dependencias.repositorioReportes.listar({
      tenantQlikId: sesion.tenantId,
      organizacionId: sesion.organizacionId,
    });
    return responderExito(c, reportes.map(serializarConfiguracion));
  });

  rutas.post("/", async (c) => {
    const validacion = esquemaCrearReporte.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!validacion.success) return respuestaValidacion(c, validacion.error);

    const sesion = await dependencias.resolverSesion(c);
    const qlik = await dependencias.resolverQlik(c);
    const bigQuery = await dependencias.resolverBigQuery(c);
    try {
      const reporte = await new CrearReporte(
        qlik,
        new PreflightDataflow(qlik, bigQuery.estimador, {
          projectId: bigQuery.projectId,
          dataset: bigQuery.dataset,
        }),
        dependencias.repositorioReportes,
      ).ejecutar(validacion.data, sesion);
      return responderExito(c, serializarConfiguracion(reporte));
    } catch (error) {
      return respuestaErrorAplicacion(c, error);
    }
  });

  rutas.post("/:reporteId/clonar", async (c) => {
    const validacion = esquemaClonarReporte.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!validacion.success) return respuestaValidacion(c, validacion.error);
    const sesion = await dependencias.resolverSesion(c);
    try {
      const reporte = await new ClonarReporte(
        dependencias.repositorioReportes,
      ).ejecutar(
        c.req.param("reporteId") ?? "",
        validacion.data.nombre,
        sesion,
      );
      return responderExito(c, serializarConfiguracion(reporte));
    } catch (error) {
      return respuestaErrorAplicacion(c, error);
    }
  });

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

  const obtenerDetalle = async (c: Context) => {
    const sesion = await dependencias.resolverSesion(c);
    const configuracion = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      c.req.param("reporteId") ?? "",
    );
    if (!configuracion) return respuestaNoEncontrada(c);
    return responderExito(c, serializarConfiguracion(configuracion));
  };

  rutas.get("/:reporteId", obtenerDetalle);
  rutas.get("/:reporteId/configuracion", obtenerDetalle);

  const actualizarDetalle = async (c: Context) => {
    const json = await c.req.json().catch(() => undefined);
    const validacion = esquemaActualizarConfiguracionReporte.safeParse(json);
    if (!validacion.success) {
      return c.json(
        {
          exito: false,
          error: {
            mensaje: "La configuración contiene campos no permitidos",
            detalles: validacion.error.flatten(),
          },
        },
        400,
      );
    }

    const sesion = await dependencias.resolverSesion(c);
    const reporteId = c.req.param("reporteId") ?? "";
    const actual = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      reporteId,
    );
    if (!actual) return respuestaNoEncontrada(c);

    const cambios = validacion.data;
    let flujoNombreSnapshot: string | undefined;
    let flujoEspacioIdQlik: string | null | undefined;
    if (cambios.flujoIdQlik && cambios.flujoIdQlik !== actual.flujoIdQlik) {
      const [qlik, bigQuery] = await Promise.all([
        dependencias.resolverQlik(c),
        dependencias.resolverBigQuery(c),
      ]);
      const preflight = await new PreflightDataflow(qlik, bigQuery.estimador, {
        projectId: bigQuery.projectId,
        dataset: bigQuery.dataset,
      }).ejecutar(cambios.flujoIdQlik);
      if (!preflight.compatible) {
        return c.json(
          {
            exito: false,
            error: {
              codigo: "DATAFLOW_NO_COMPATIBLE",
              mensaje: "El nuevo Dataflow no es compatible",
              operacionesNoSoportadas: preflight.operacionesNoSoportadas,
            },
          },
          422,
        );
      }
      const flujo = (await qlik.listarFlujos()).find(
        (item) => item.id === cambios.flujoIdQlik,
      );
      if (!flujo)
        return c.json(
          {
            exito: false,
            error: {
              codigo: "DATAFLOW_NO_ENCONTRADO",
              mensaje: "El Dataflow ya no existe en Qlik",
            },
          },
          404,
        );
      flujoNombreSnapshot = flujo.name;
      flujoEspacioIdQlik = flujo.spaceId ?? null;
    }

    const actualizada =
      await dependencias.repositorioReportes.actualizarReporte(actual.id, {
        ...(cambios.nombre ? { nombre: cambios.nombre } : {}),
        ...(cambios.flujoIdQlik ? { flujoIdQlik: cambios.flujoIdQlik } : {}),
        ...(flujoNombreSnapshot ? { flujoNombreSnapshot } : {}),
        ...(flujoEspacioIdQlik !== undefined ? { flujoEspacioIdQlik } : {}),
        ...(cambios.activa !== undefined
          ? { estado: cambios.activa ? "activa" : "desactivada" }
          : {}),
      });
    return responderExito(c, serializarConfiguracion(actualizada));
  };

  rutas.put("/:reporteId", actualizarDetalle);
  rutas.put("/:reporteId/configuracion", actualizarDetalle);

  const listarHistorial = async (c: Context) => {
    const sesion = await dependencias.resolverSesion(c);
    const reporteId = c.req.param("reporteId") ?? "";
    const configuracion = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      reporteId,
    );
    if (!configuracion) return respuestaNoEncontrada(c);

    const ejecuciones =
      await dependencias.repositorioReportes.listarEjecuciones(
        configuracion.id,
        100,
      );
    return responderExito(c, ejecuciones.map(serializarEjecucion));
  };

  rutas.get("/:reporteId/ejecuciones", listarHistorial);
  rutas.get("/:reporteId/ejecuciones-locales", listarHistorial);

  rutas.post("/:reporteId/ejecuciones", async (c) => {
    if (!dependencias.resolverEjecutarReporte) {
      throw new ErrorAplicacion(
        "EXECUTOR_NOT_CONFIGURED",
        "La ejecución de reportes no está configurada",
        500,
      );
    }
    const sesion = await dependencias.resolverSesion(c);
    try {
      const ejecutarReporte = await dependencias.resolverEjecutarReporte(c);
      const resultado = await ejecutarReporte({
        reporteId: c.req.param("reporteId") ?? "",
        tenantId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
        usuarioId: sesion.usuarioId,
        usuarioIdQlik: sesion.usuarioIdQlik,
      });
      return responderExito(c, resultado);
    } catch (error) {
      return respuestaErrorAplicacion(c, error);
    }
  });

  return rutas;
}

const esquemaClonarReporte = z
  .object({
    nombre: z.string().trim().min(1).max(255),
  })
  .strict();

function respuestaValidacion(c: Context, error: z.ZodError) {
  return c.json(
    {
      exito: false,
      error: { mensaje: "La solicitud es inválida", detalles: error.flatten() },
    },
    400,
  );
}

function respuestaErrorAplicacion(c: Context, error: unknown) {
  if (error instanceof ErrorAplicacion) {
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
  throw error;
}

async function obtenerConfiguracionAutorizada(
  repositorio: PuertoRepositorioReportes,
  sesion: SesionReportes,
  reporteId: string,
) {
  return repositorio.obtenerPorId(
    reporteId,
    sesion.tenantId,
    sesion.organizacionId,
  );
}

function serializarConfiguracion(
  configuracion: Awaited<ReturnType<PuertoRepositorioReportes["obtenerPorId"]>>,
) {
  if (!configuracion) throw new Error("Configuración ausente");
  return {
    id: configuracion.id,
    creadoPorUsuarioId: configuracion.creadoPorUsuarioId,
    nombre: configuracion.nombre,
    flujoIdQlik: configuracion.flujoIdQlik,
    flujoNombreSnapshot: configuracion.flujoNombreSnapshot,
    flujoEspacioIdQlik: configuracion.flujoEspacioIdQlik ?? null,
    destinoGcs: URI_BASE_GCS_REPORTES,
    activa: configuracion.estado === "activa",
  };
}

function serializarEjecucion(
  ejecucion: Awaited<
    ReturnType<PuertoRepositorioReportes["listarEjecuciones"]>
  >[number],
) {
  return {
    id: ejecucion.id,
    reporteId: ejecucion.reporteId,
    flujoIdQlik: ejecucion.flujoIdQlik,
    automatizacionIdQlik: ejecucion.automatizacionIdQlik,
    runIdQlik: ejecucion.runIdQlik ?? null,
    hashDataflowSha256: ejecucion.hashDataflowSha256,
    scriptDataflow: ejecucion.scriptDataflow,
    sqlBigQueryCompilado: ejecucion.sqlBigQueryCompilado,
    scriptExportacion: ejecucion.scriptExportacion,
    uriBaseGcs: ejecucion.uriBaseGcs,
    estado: ejecucion.estado,
    versionCompilador: ejecucion.versionCompilador,
    etapaError: ejecucion.etapaError ?? null,
    mensajeError: ejecucion.mensajeError ?? null,
    iniciadoEn: ejecucion.iniciadoEn?.toISOString() ?? null,
    finalizadoEn: ejecucion.finalizadoEn?.toISOString() ?? null,
    creadoEn: (
      ejecucion.creadoEn ??
      ejecucion.iniciadoEn ??
      new Date(0)
    ).toISOString(),
  };
}

function respuestaNoEncontrada(c: Context, mensaje = "Reporte no encontrado") {
  return c.json({ exito: false, error: { mensaje } }, 404);
}

import { esquemaActualizarConfiguracionReporte } from "@qlik/contratos";
import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
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
}

export interface DependenciasRutasReportesDataflow {
  resolverQlik(c: Context): Promise<PuertoQlik>;
  resolverBigQuery(c: Context): Promise<ResolucionBigQueryReporte>;
  resolverSesion(c: Context): Promise<SesionReportes>;
  repositorioReportes: PuertoRepositorioReportes;
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

  rutas.get("/:reporteId/configuracion", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const configuracion = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      c.req.param("reporteId"),
    );
    if (!configuracion) return respuestaNoEncontrada(c);
    return responderExito(c, serializarConfiguracion(configuracion));
  });

  rutas.put("/:reporteId/configuracion", async (c) => {
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
    const reporteId = c.req.param("reporteId");
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
        return respuestaNoEncontrada(c, "El Dataflow ya no existe en Qlik");
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
  });

  rutas.get("/:reporteId/ejecuciones-locales", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const reporteId = c.req.param("reporteId");
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
  });

  return rutas;
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

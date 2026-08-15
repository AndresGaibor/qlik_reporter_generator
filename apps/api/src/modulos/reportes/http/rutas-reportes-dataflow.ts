import { esquemaActualizarConfiguracionReporte } from "@qlik/contratos";
import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import {
  type AlcanceBigQueryReporte,
  type EstimadorBigQueryReporte,
  PreflightDataflow,
} from "../aplicacion/preflight-dataflow.js";
import { calcularProximaEjecucion } from "../aplicacion/programacion-reporte.js";
import type { PuertoRepositorioReportes } from "../aplicacion/puertos/puerto-repositorio-reportes.js";
import { SincronizarEjecucionesReporte } from "../aplicacion/sincronizar-ejecuciones-reporte.js";

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

  rutas.get("/:automatizacionId/configuracion", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const configuracion = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      c.req.param("automatizacionId"),
    );
    if (!configuracion) return respuestaNoEncontrada(c);
    const programacion =
      await dependencias.repositorioReportes.obtenerProgramacion(
        configuracion.id,
      );
    return responderExito(
      c,
      serializarConfiguracion(configuracion, programacion),
    );
  });

  rutas.put("/:automatizacionId/configuracion", async (c) => {
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
    const automatizacionId = c.req.param("automatizacionId");
    const actual = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      automatizacionId,
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

    const programacion =
      cambios.programacion === undefined
        ? undefined
        : cambios.programacion === null
          ? null
          : {
              activa: cambios.programacion.activa,
              expresionCron: cambios.programacion.expresionCron,
              zonaHoraria: cambios.programacion.zonaHoraria,
              proximaEjecucionEn: calcularProximaEjecucion(
                cambios.programacion.expresionCron,
                cambios.programacion.zonaHoraria,
                new Date(),
              ),
            };

    let qlikRenombrado:
      | {
          cliente: PuertoQlik;
          original: Awaited<ReturnType<PuertoQlik["obtenerAutomatizacion"]>>;
        }
      | undefined;
    if (cambios.nombre && cambios.nombre !== actual.nombre) {
      const qlik = await dependencias.resolverQlik(c);
      const original = await qlik.obtenerAutomatizacion(automatizacionId);
      await qlik.actualizarAutomatizacion(automatizacionId, {
        name: cambios.nombre,
        schedules: [],
        workspace: original.workspace ?? {},
        description: original.description ?? "",
        maxConcurrentRuns: original.maxConcurrentRuns ?? 1,
      });
      qlikRenombrado = { cliente: qlik, original };
    }

    let actualizada: Awaited<
      ReturnType<PuertoRepositorioReportes["actualizarConfiguracion"]>
    >;
    try {
      actualizada =
        await dependencias.repositorioReportes.actualizarConfiguracion(
          actual.id,
          {
            ...(cambios.nombre
              ? {
                  nombre: cambios.nombre,
                  automatizacionNombreSnapshot: cambios.nombre,
                }
              : {}),
            ...(cambios.flujoIdQlik
              ? { flujoIdQlik: cambios.flujoIdQlik }
              : {}),
            ...(flujoNombreSnapshot ? { flujoNombreSnapshot } : {}),
            ...(flujoEspacioIdQlik !== undefined ? { flujoEspacioIdQlik } : {}),
            ...(cambios.activa !== undefined
              ? { estado: cambios.activa ? "activa" : "desactivada" }
              : {}),
            ...(cambios.programacion !== undefined ? { programacion } : {}),
          },
        );
    } catch (error) {
      if (qlikRenombrado) {
        const { cliente, original } = qlikRenombrado;
        await cliente.actualizarAutomatizacion(automatizacionId, {
          name: original.name,
          schedules: [],
          workspace: original.workspace ?? {},
          description: original.description ?? "",
          maxConcurrentRuns: original.maxConcurrentRuns ?? 1,
        });
      }
      throw error;
    }
    const programacionActual =
      await dependencias.repositorioReportes.obtenerProgramacion(
        actualizada.id,
      );
    return responderExito(
      c,
      serializarConfiguracion(actualizada, programacionActual),
    );
  });

  rutas.get("/:automatizacionId/ejecuciones-locales", async (c) => {
    const [sesion, qlik] = await Promise.all([
      dependencias.resolverSesion(c),
      dependencias.resolverQlik(c),
    ]);
    const automatizacionId = c.req.param("automatizacionId");
    const configuracion = await obtenerConfiguracionAutorizada(
      dependencias.repositorioReportes,
      sesion,
      automatizacionId,
    );
    if (!configuracion) return respuestaNoEncontrada(c);

    await new SincronizarEjecucionesReporte(
      qlik,
      dependencias.repositorioReportes,
    ).ejecutar(sesion.tenantId, automatizacionId);
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
  automatizacionIdQlik: string,
) {
  const configuracion = await repositorio.obtenerPorAutomatizacion(
    sesion.tenantId,
    automatizacionIdQlik,
  );
  if (
    !configuracion ||
    configuracion.organizacionId !== sesion.organizacionId
  ) {
    return null;
  }
  return configuracion;
}

function serializarConfiguracion(
  configuracion: Awaited<
    ReturnType<PuertoRepositorioReportes["obtenerPorAutomatizacion"]>
  > & {},
  programacion: Awaited<
    ReturnType<PuertoRepositorioReportes["obtenerProgramacion"]>
  >,
) {
  if (!configuracion) throw new Error("Configuración ausente");
  return {
    id: configuracion.id,
    nombre: configuracion.nombre,
    flujoIdQlik: configuracion.flujoIdQlik,
    flujoNombreSnapshot: configuracion.flujoNombreSnapshot,
    flujoEspacioIdQlik: configuracion.flujoEspacioIdQlik ?? null,
    automatizacionIdQlik: configuracion.automatizacionIdQlik,
    automatizacionNombreSnapshot: configuracion.automatizacionNombreSnapshot,
    destinoGcs: configuracion.destinoIdExterno,
    activa: configuracion.estado === "activa",
    programacion: programacion
      ? {
          activa: programacion.activa,
          expresionCron: programacion.expresionCron,
          zonaHoraria: programacion.zonaHoraria,
          proximaEjecucionEn: programacion.proximaEjecucionEn.toISOString(),
        }
      : null,
  };
}

function serializarEjecucion(
  ejecucion: Awaited<
    ReturnType<PuertoRepositorioReportes["listarEjecuciones"]>
  >[number],
) {
  return {
    id: ejecucion.id,
    configuracionId: ejecucion.configuracionId,
    flujoIdQlik: ejecucion.flujoIdQlik,
    automatizacionIdQlik: ejecucion.automatizacionIdQlik,
    runIdQlik: ejecucion.runIdQlik ?? null,
    hashDataflowSha256: ejecucion.hashDataflowSha256,
    scriptDataflow: ejecucion.scriptDataflow,
    sqlBigQueryCompilado: ejecucion.sqlBigQueryCompilado,
    scriptExportacion: ejecucion.scriptExportacion,
    uriBaseGcs: ejecucion.uriBaseGcs,
    tipoEjecucion: ejecucion.tipoEjecucion,
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

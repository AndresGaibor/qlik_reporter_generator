import { type Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { PuertoAlmacenamientoDescargas } from "../../descargas/aplicacion/puerto-almacenamiento-descargas.js";
import { parsearUriGcsPermitida } from "../../descargas/aplicacion/puerto-almacenamiento-descargas.js";
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
import type { PuertoJobsBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";
import {
  type EntradaEjecutarReporte,
  construirCarpetaDescargasReporte,
} from "../aplicacion/ejecutar-reporte.js";
import { VistaPreviaDataflow } from "../aplicacion/vista-previa-dataflow.js";
import {
  type AlcanceBigQueryReporte,
  type EstimadorBigQueryReporte,
  PreflightDataflow,
} from "../aplicacion/preflight-dataflow.js";
import type {
  JobBigQueryPersistido,
  PuertoRepositorioReportes,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";
import { SincronizarEjecucionesReporte } from "../aplicacion/sincronizar-ejecuciones-reporte.js";
import { SincronizarJobsBigQueryEjecucion } from "../aplicacion/sincronizar-jobs-bigquery-ejecucion.js";

export type ResolucionBigQueryReporte = AlcanceBigQueryReporte & {
  estimador: EstimadorBigQueryReporte;
};
interface SesionReportes {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  usuarioIdQlik: string;
  correo?: string | null;
}

export interface DependenciasRutasReportesDataflow {
  resolverQlik(c: Context): Promise<PuertoQlik>;
  resolverConsultaFlujos(c: Context): Promise<PuertoConsultaFlujos>;
  resolverBigQuery(c: Context): Promise<ResolucionBigQueryReporte>;
  resolverSesion(c: Context): Promise<SesionReportes>;
  repositorioReportes: PuertoRepositorioReportes;
  resolverAlmacenamiento?: (
    c: Context,
  ) => Promise<PuertoAlmacenamientoDescargas>;
  resolverJobsBigQuery?: (c: Context) => Promise<PuertoJobsBigQuery>;
  resolverEjecutarReporte?: (c: Context) => Promise<
    (entrada: EntradaEjecutarReporte) => Promise<{
      runId: string;
      ejecucionReporteId: string;
      carpetaDescargas: string;
    }>
  >;
  resolverPreviewBigQuery?: (
    c: Context,
  ) => Promise<{ clientePreview: PuertoLecturaBigQuery }>;
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

    const sesion = await dependencias.resolverSesion(c);
    const ultimasEjecuciones =
      await dependencias.repositorioReportes.listarUltimasEjecucionesPorFlujo(
        sesion.tenantId,
        sesion.organizacionId,
      );
    const ultimaEjecucionPorFlujo = new Map(
      ultimasEjecuciones.map((ejecucion) => [
        ejecucion.flujoIdQlik,
        ejecucion.ultimaEjecucionEn,
      ]),
    );
    const reportes = flujos
      .map((flujo) => ({
        id: flujo.id,
        nombre: flujo.nombre,
        espacioId: flujo.espacioId ?? null,
        espacioNombre: flujo.espacioNombre ?? null,
        modificadoEn: flujo.modificadoEn ?? null,
        creadoEn: flujo.creadoEn ?? null,
        ultimaEjecucionEn:
          ultimaEjecucionPorFlujo.get(flujo.id)?.toISOString() ?? null,
        carpetaDescargas: construirCarpetaDescargasReporte(flujo.nombre),
      }))
      .sort(compararActividadReporte);
    return responderExito(c, reportes);
  });

  rutas.get("/:flujoId", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    return responderExito(c, {
      ...flujo,
      carpetaDescargas: construirCarpetaDescargasReporte(flujo.nombre),
    });
  });

  rutas.get("/:flujoId/resumen", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const qlik = await dependencias.resolverQlik(c);
    try {
      const { script } = await qlik.obtenerScriptApp(
        flujo.appId ?? flujo.id,
        "current",
      );
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
      }).ejecutar(flujo.id, flujo.appId ?? flujo.id),
    );
  });

  rutas.get("/:flujoId/preview", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    if (!dependencias.resolverPreviewBigQuery) {
      return c.json(
        {
          exito: false,
          error: {
            codigo: "PREVIEW_NOT_CONFIGURED",
            mensaje: "Preview no está configurado",
          },
        },
        500,
      );
    }
    const [qlik, { clientePreview }] = await Promise.all([
      dependencias.resolverQlik(c),
      dependencias.resolverPreviewBigQuery(c),
    ]);
    const caso = new VistaPreviaDataflow(qlik, clientePreview);
    const resultado = await caso.ejecutar(flujo.id, flujo.appId ?? flujo.id);
    return responderExito(c, resultado);
  });

  rutas.get("/:flujoId/ejecuciones", async (c) => {
    const flujo = await obtenerFlujo(c);
    if (!flujo) return noEncontradoDataflow(c);
    const sesion = await dependencias.resolverSesion(c);
    let ejecuciones = await dependencias.repositorioReportes.listarEjecuciones(
      flujo.id,
      sesion.tenantId,
      sesion.organizacionId,
      100,
    );

    const hayActivas = ejecuciones.some(esEjecucionActiva);
    const hayPendientesBigQuery = ejecuciones.some(
      (ejecucion) =>
        Boolean(ejecucion.jobIdPrincipalBigQuery) &&
        Boolean(ejecucion.bigqueryProjectId) &&
        !ejecucion.bigqueryFinalizadoEn,
    );
    if (hayActivas || hayPendientesBigQuery) {
      if (dependencias.resolverJobsBigQuery) {
        try {
          const jobsBigQuery = await dependencias.resolverJobsBigQuery(c);
          const sincronizadorBq = new SincronizarJobsBigQueryEjecucion(
            dependencias.repositorioReportes,
            jobsBigQuery,
          );
          await Promise.all(
            ejecuciones
              .filter(
                (e) =>
                  Boolean(e.jobIdPrincipalBigQuery) &&
                  Boolean(e.bigqueryProjectId) &&
                  (esEjecucionActiva(e) || !e.bigqueryFinalizadoEn),
              )
              .map((e) =>
                sincronizadorBq.sincronizar(e.id).catch(() => undefined),
              ),
          );
        } catch {
          // Un fallo transitorio de BigQuery no debe detener el polling.
        }
      }

      if (hayActivas) {
        try {
          const qlik = await dependencias.resolverQlik(c);
          const finalizadasTrasTalend = await new SincronizarEjecucionesReporte(
            qlik,
            dependencias.repositorioReportes,
          ).ejecutar(flujo.id, sesion.tenantId, sesion.organizacionId);
          if (finalizadasTrasTalend.size > 0) {
            const jobsPorEjecucion =
              await dependencias.repositorioReportes.listarJobsBigQueryPorEjecucionIds(
                [...finalizadasTrasTalend.keys()],
              );
            await Promise.all(
              [...finalizadasTrasTalend.entries()].map(
                async ([ejecucionId, finalizadoPorQlik]) => {
                  const principal = jobsPorEjecucion
                    .get(ejecucionId)
                    ?.find((job) => job.tipo === "principal");
                  if (principal?.estado !== "done") return;
                  const finalizadoEn = principal.endTime
                    ? new Date(principal.endTime)
                    : finalizadoPorQlik;
                  await dependencias.repositorioReportes.marcarEstadoEjecucion(
                    ejecucionId,
                    "completada",
                    finalizadoEn,
                  );
                },
              ),
            );
          }
        } catch {
          // El historial sigue disponible aunque Qlik no responda temporalmente.
        }
      }

      ejecuciones = await dependencias.repositorioReportes.listarEjecuciones(
        flujo.id,
        sesion.tenantId,
        sesion.organizacionId,
        100,
      );

      if (dependencias.resolverAlmacenamiento) {
        try {
          const almacenamiento = await dependencias.resolverAlmacenamiento(c);
          await Promise.all(
            ejecuciones.filter(esEjecucionActiva).map(async (ejecucion) => {
              const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
              if (!prefijo.endsWith(`${ejecucion.id}/`)) return;
              if (!(await almacenamiento.estaFinalizada(prefijo))) return;
              await dependencias.repositorioReportes.marcarGcsFinalizada(
                ejecucion.id,
                new Date(),
              );
            }),
          );
        } catch {
          // Un fallo transitorio de GCS no debe ocultar el historial.
        }
      }

      ejecuciones = await dependencias.repositorioReportes.listarEjecuciones(
        flujo.id,
        sesion.tenantId,
        sesion.organizacionId,
        100,
      );
    }

    const jobsPorEjecucion = await cargarJobsPorEjecucion(
      ejecuciones,
      dependencias.repositorioReportes,
    );

    return responderExito(
      c,
      ejecuciones.map((e) =>
        serializarEjecucion(e, jobsPorEjecucion.get(e.id) ?? []),
      ),
    );
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

function compararActividadReporte(
  a: {
    nombre: string;
    creadoEn: string | null;
    modificadoEn: string | null;
    ultimaEjecucionEn: string | null;
  },
  b: {
    nombre: string;
    creadoEn: string | null;
    modificadoEn: string | null;
    ultimaEjecucionEn: string | null;
  },
) {
  const actividadA = Date.parse(
    a.ultimaEjecucionEn ?? a.creadoEn ?? a.modificadoEn ?? "",
  );
  const actividadB = Date.parse(
    b.ultimaEjecucionEn ?? b.creadoEn ?? b.modificadoEn ?? "",
  );
  const diferencia =
    (Number.isNaN(actividadB) ? 0 : actividadB) -
    (Number.isNaN(actividadA) ? 0 : actividadA);
  return diferencia || a.nombre.localeCompare(b.nombre, "es");
}

function esEjecucionActiva(ejecucion: { estado: string }) {
  return ejecucion.estado === "preparando" || ejecucion.estado === "iniciada";
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
  jobs: JobBigQueryPersistido[],
) {
  const jobPrincipal = jobs.find(
    (j) => j.jobId === ejecucion.jobIdPrincipalBigQuery,
  );
  const childJobs = jobs.filter((j) => j.parentJobId !== null);

  const metricas = calcularMetricasEjecucion(
    ejecucion,
    jobPrincipal,
    childJobs,
  );
  const jobsBigQuery = jobs.map(mapJobBigQuery);

  return {
    ...ejecucion,
    jobIdBigQuery: ejecucion.jobIdPrincipalBigQuery ?? null,
    bigQueryProjectId: ejecucion.bigqueryProjectId ?? null,
    bigQueryLocation: ejecucion.bigqueryLocation ?? null,
    metricas,
    jobsBigQuery,
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

function calcularMetricasEjecucion(
  ejecucion: {
    creadoEn?: Date;
    iniciadoEn?: Date | null;
    finalizadoEn?: Date | null;
    bigqueryIniciadoEn?: Date | null;
    bigqueryFinalizadoEn?: Date | null;
  },
  jobPrincipal: JobBigQueryPersistido | undefined,
  childJobs: JobBigQueryPersistido[],
): {
  duracionTotalMs: number | null;
  duracionBigQueryMs: number | null;
  totalBytesProcessed: string | null;
  totalBytesBilled: string | null;
  totalSlotMs: string | null;
} {
  let duracionTotalMs: number | null = null;
  const inicioTotal = ejecucion.iniciadoEn ?? ejecucion.creadoEn;
  if (ejecucion.finalizadoEn && inicioTotal) {
    duracionTotalMs =
      ejecucion.finalizadoEn.getTime() - inicioTotal.getTime();
  }

  let duracionBigQueryMs: number | null = null;
  if (jobPrincipal?.endTime && jobPrincipal?.startTime) {
    const end = new Date(jobPrincipal.endTime).getTime();
    const start = new Date(jobPrincipal.startTime).getTime();
    duracionBigQueryMs = end - start;
  } else if (ejecucion.bigqueryFinalizadoEn && ejecucion.bigqueryIniciadoEn) {
    duracionBigQueryMs =
      ejecucion.bigqueryFinalizadoEn.getTime() -
      ejecucion.bigqueryIniciadoEn.getTime();
  }

  if (jobPrincipal) {
    return {
      duracionTotalMs,
      duracionBigQueryMs,
      totalBytesProcessed: jobPrincipal.totalBytesProcessed,
      totalBytesBilled: jobPrincipal.totalBytesBilled,
      totalSlotMs: jobPrincipal.totalSlotMs,
    };
  }

  if (childJobs.length === 0) {
    return {
      duracionTotalMs,
      duracionBigQueryMs,
      totalBytesProcessed: null,
      totalBytesBilled: null,
      totalSlotMs: null,
    };
  }

  const sumBytes = (
    key: "totalBytesProcessed" | "totalBytesBilled" | "totalSlotMs",
  ) => {
    const vals = childJobs
      .map((j) => j[key])
      .filter((v): v is string => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return vals.reduce(
      (acc, v) => {
        const n = BigInt(v);
        return (BigInt(acc ?? "0") + n).toString();
      },
      null as string | null,
    );
  };

  return {
    duracionTotalMs,
    duracionBigQueryMs,
    totalBytesProcessed: sumBytes("totalBytesProcessed"),
    totalBytesBilled: sumBytes("totalBytesBilled"),
    totalSlotMs: sumBytes("totalSlotMs"),
  };
}

function mapJobBigQuery(job: JobBigQueryPersistido): {
  jobId: string;
  parentJobId: string | null;
  tipo: string;
  estado: string;
  startTime: string | null;
  endTime: string | null;
  duracionMs: number | null;
  totalBytesProcessed: string | null;
  totalBytesBilled: string | null;
  totalSlotMs: string | null;
} {
  return {
    jobId: job.jobId,
    parentJobId: job.parentJobId,
    tipo: job.tipo,
    estado: job.estado,
    startTime: job.startTime,
    endTime: job.endTime,
    duracionMs: job.duracionMs,
    totalBytesProcessed: job.totalBytesProcessed,
    totalBytesBilled: job.totalBytesBilled,
    totalSlotMs: job.totalSlotMs,
  };
}

async function cargarJobsPorEjecucion(
  ejecuciones: Array<{ id: string; jobIdPrincipalBigQuery?: string | null }>,
  repositorio: PuertoRepositorioReportes,
): Promise<Map<string, JobBigQueryPersistido[]>> {
  const idsConJob = ejecuciones
    .filter((e) => Boolean(e.jobIdPrincipalBigQuery))
    .map((e) => e.id);

  if (idsConJob.length === 0) {
    return new Map();
  }

  if (typeof repositorio.listarJobsBigQueryPorEjecucionIds === "function") {
    return repositorio.listarJobsBigQueryPorEjecucionIds(idsConJob);
  }

  const map = new Map<string, JobBigQueryPersistido[]>();
  await Promise.all(
    idsConJob.map(async (id) => {
      if (typeof repositorio.listarJobsBigQueryPorEjecucion === "function") {
        const jobs = await repositorio.listarJobsBigQueryPorEjecucion(id);
        map.set(id, jobs);
      }
    }),
  );
  return map;
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

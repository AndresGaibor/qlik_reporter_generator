import { describe, expect, it, vi } from "bun:test";
import { Readable, Writable } from "node:stream";
import { Hono } from "hono";
import {
  crearRutasReportesDataflow,
  filtrarFlujosVisibles,
} from "./rutas-reportes-dataflow.js";

const sesion = {
  tenantId: "tenant-1",
  organizacionId: "org-1",
  usuarioId: "user-1",
  usuarioIdQlik: "qlik-1",
  roles: ["admin" as const],
};

it("usuario final solo ve Dataflows propios o compartidos", () => {
  const flujos = [
    {
      id: "propio",
      nombre: "Propio",
      espacioNombre: "Ventas",
      propietarioId: "qlik-1",
    },
    {
      id: "compartido",
      nombre: "Compartido",
      espacioNombre: "Ventas",
      propietarioId: "qlik-2",
    },
    {
      id: "ajeno",
      nombre: "Ajeno",
      espacioNombre: "Ventas",
      propietarioId: "qlik-3",
    },
  ];
  expect(
    filtrarFlujosVisibles(
      flujos,
      "qlik-1",
      new Map([["compartido", true]]),
      false,
    ).map((flujo) => flujo.id),
  ).toEqual(["propio", "compartido"]);
});

function appCon(qlik: Record<string, unknown>, extras = {}) {
  return new Hono().route(
    "/api/reportes",
    crearRutasReportesDataflow({
      resolverQlik: async () => qlik as never,
      resolverConsultaFlujos: async () => ({
        listar: async (espacioId?: string) =>
          (
            await (
              qlik.listarFlujos as (id?: string) => Promise<
                Array<{
                  id: string;
                  appId?: string;
                  name: string;
                  spaceId?: string;
                  createdAt?: string;
                  updatedAt?: string;
                }>
              >
            )(espacioId)
          ).map((f) => ({
            id: f.id,
            ...(f.appId ? { appId: f.appId } : {}),
            nombre: f.name,
            espacioId: f.spaceId,
            espacioNombre: f.spaceId ?? "Espacio personal",
            ...(f.createdAt ? { creadoEn: f.createdAt } : {}),
            ...(f.updatedAt ? { modificadoEn: f.updatedAt } : {}),
          })),
      }),
      resolverBigQuery: async () => ({
        estimador: {
          estimarConsulta: vi.fn(async () => ({
            bytesProcesados: 1,
            costoEstimadoUsd: 0,
          })),
        },
        projectId: "p",
        dataset: "d",
      }),
      resolverSesion: async () => sesion,
      dependenciasClonado: {
        resolverSesion: async () => ({ tenantId: sesion.tenantId }),
        obtenerTenant: async () => null,
        resolverQlik: async () => qlik as never,
      },
      repositorioReportes: {
        listarEjecuciones: vi.fn(async () => []),
        listarUltimasEjecucionesPorFlujo: vi.fn(async () => []),
      } as never,
      ...extras,
    }),
  );
}

describe("fachada /api/reportes para Dataflows", () => {
  it("expone la plantilla base con la autorización del tenant", async () => {
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          { id: "base-1", name: "Base Ventas" },
        ]),
      },
      {
        dependenciasClonado: {
          resolverSesion: async () => ({ tenantId: "tenant-1" }),
          obtenerTenant: async () => ({
            dataflowBaseIdQlik: "base-1",
            dataflowBaseNombre: "Base Ventas",
          }),
          resolverQlik: async () =>
            ({
              listarFlujos: async () => [{ id: "base-1", name: "Base Ventas" }],
            }) as never,
        },
      },
    );

    const respuesta = await app.request("/api/reportes/plantilla-base");

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).datos).toEqual({
      id: "base-1",
      nombre: "Base Ventas",
    });
  });

  it("rechaza en la ruta canónica una plantilla ausente en el tenant Qlik", async () => {
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          { id: "otro-1", name: "Base Ventas" },
        ]),
      },
      {
        dependenciasClonado: {
          resolverSesion: async () => ({ tenantId: "tenant-1" }),
          obtenerTenant: async () => ({
            dataflowBaseIdQlik: "base-1",
            dataflowBaseNombre: "Base Ventas",
          }),
          resolverQlik: async () =>
            ({
              listarFlujos: async () => [{ id: "otro-1", name: "Base Ventas" }],
            }) as never,
        },
      },
    );

    const respuesta = await app.request("/api/reportes/plantilla-base");

    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error.codigo).toBe(
      "DATAFLOW_BASE_NO_DISPONIBLE_EN_TENANT",
    );
  });

  it("crea un reporte desde la plantilla usando el App ID disponible en Qlik", async () => {
    const copiarDataflow = vi.fn(async () => ({
      id: "copia-1",
      nombre: "Copia ventas",
    }));
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          {
            id: "item-1",
            appId: "app-real-1",
            name: "Base Ventas",
            spaceId: "space-1",
            description: "qlik generator",
          },
        ]),
        copiarDataflow,
      },
      {
        dependenciasClonado: {
          resolverSesion: async () => ({ tenantId: "tenant-1" }),
          obtenerTenant: async () => ({ dataflowBaseIdQlik: "item-1" }),
          resolverQlik: async () =>
            ({
              listarFlujos: async () => [
                {
                  id: "item-1",
                  appId: "app-real-1",
                  name: "Base Ventas",
                  spaceId: "space-1",
                  description: "qlik generator",
                },
              ],
              copiarDataflow,
            }) as never,
        },
      },
    );

    const respuesta = await app.request("/api/reportes/desde-plantilla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Copia ventas" }),
    });

    expect(respuesta.status).toBe(201);
    expect(copiarDataflow).toHaveBeenCalledWith("app-real-1", "Copia ventas", {
      espacioId: "space-1",
      descripcion: "qlik generator",
    });
  });

  it("lista Dataflows Qlik y aplica búsqueda y espacio, sin leer reportes locales", async () => {
    const listarFlujos = vi.fn(async () => [
      { id: "df-1", name: "Ventas", spaceId: "sp-1" },
      { id: "df-2", name: "Compras", spaceId: "sp-2" },
    ]);
    const app = appCon(
      { listarFlujos, listarEspacios: vi.fn(async () => []) },
      {
        repositorioReportes: {
          listar: vi.fn(),
          listarUltimasEjecucionesPorFlujo: vi.fn(async () => []),
        } as never,
      },
    );

    const respuesta = await app.request(
      "/api/reportes?q=ventas&espacioId=sp-1",
    );

    expect(respuesta.status).toBe(200);
    expect(listarFlujos).toHaveBeenCalledWith("sp-1");
    expect((await respuesta.json()).datos).toEqual([
      expect.objectContaining({ id: "df-1", nombre: "Ventas" }),
    ]);
  });

  it("ordena reportes por última ejecución y usa creación como respaldo", async () => {
    const listarUltimasEjecucionesPorFlujo = vi.fn(async () => [
      {
        flujoIdQlik: "df-1",
        ultimaEjecucionEn: new Date("2026-08-20T12:00:00Z"),
      },
      {
        flujoIdQlik: "df-3",
        ultimaEjecucionEn: new Date("2026-08-18T12:00:00Z"),
      },
    ]);
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          {
            id: "df-3",
            name: "Antiguo usado",
            createdAt: "2026-08-01T00:00:00Z",
          },
          {
            id: "df-2",
            name: "Nuevo sin ejecutar",
            createdAt: "2026-08-19T12:00:00Z",
          },
          {
            id: "df-1",
            name: "Usado recientemente",
            createdAt: "2026-08-10T00:00:00Z",
          },
        ]),
      },
      {
        repositorioReportes: {
          listarUltimasEjecucionesPorFlujo,
          listarEjecuciones: vi.fn(async () => []),
        } as never,
      },
    );

    const respuesta = await app.request("/api/reportes");
    const datos = (await respuesta.json()).datos;

    expect(datos.map((reporte: { id: string }) => reporte.id)).toEqual([
      "df-1",
      "df-2",
      "df-3",
    ]);
    expect(datos[0]).toMatchObject({
      creadoEn: "2026-08-10T00:00:00Z",
      ultimaEjecucionEn: "2026-08-20T12:00:00.000Z",
    });
    expect(datos[1]).toMatchObject({
      creadoEn: "2026-08-19T12:00:00Z",
      ultimaEjecucionEn: null,
    });
    expect(listarUltimasEjecucionesPorFlujo).toHaveBeenCalledWith(
      "tenant-1",
      "org-1",
    );
  });

  it("expone la carpeta canónica de descargas en lista y detalle", async () => {
    const app = appCon({
      listarFlujos: vi.fn(async () => [
        { id: "df-1", name: "Copia de Test_BQ_SFTP 2", spaceId: "sp-1" },
      ]),
    });

    const listado = (await (await app.request("/api/reportes")).json()).datos;
    const detalle = (await (await app.request("/api/reportes/df-1")).json())
      .datos;

    expect(listado[0].carpetaDescargas).toBe("copia-de-test-bq-sftp-2/");
    expect(detalle.carpetaDescargas).toBe("copia-de-test-bq-sftp-2/");
  });

  it("expone detalle, resumen y preflight del Dataflow actual", async () => {
    const qlik = {
      listarFlujos: vi.fn(async () => [
        { id: "df-1", appId: "app-real-1", name: "Ventas", spaceId: "sp-1" },
      ]),
      obtenerScriptApp: vi.fn(async () => ({
        script: "LOAD id; SQL SELECT id FROM `p.d.t`;",
      })),
      validarScriptApp: vi.fn(async () => ({ errores: [], advertencias: [] })),
    };
    const app = appCon(qlik);
    expect(
      (await (await app.request("/api/reportes/df-1")).json()).datos,
    ).toMatchObject({ id: "df-1", nombre: "Ventas" });
    expect(
      (await (await app.request("/api/reportes/df-1/resumen")).json()).datos
        .flujoId,
    ).toBe("df-1");
    expect(
      (await (await app.request("/api/reportes/df-1/preflight")).json()).datos
        .flujoIdQlik,
    ).toBe("df-1");
    expect(qlik.obtenerScriptApp).toHaveBeenCalledWith("app-real-1", "current");
  });

  it("rechaza un Dataflow que no está disponible en el tenant", async () => {
    const app = appCon({ listarFlujos: vi.fn(async () => []) });
    const respuesta = await app.request("/api/reportes/df-1");
    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error.codigo).toBe(
      "DATAFLOW_NO_ENCONTRADO",
    );
  });

  it("lista historial y ejecuta usando flujoIdQlik, no reporteId", async () => {
    const ejecutar = vi.fn(async () => ({
      runId: "run-1",
      ejecucionReporteId: "exec-1",
      carpetaDescargas: "ventas/",
    }));
    const listarEjecuciones = vi.fn(async () => []);
    const app = appCon(
      { listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]) },
      {
        repositorioReportes: { listarEjecuciones },
        resolverEjecutarReporte: async () => ejecutar,
      },
    );
    expect((await app.request("/api/reportes/df-1/ejecuciones")).status).toBe(
      200,
    );
    const respuesta = await app.request("/api/reportes/df-1/ejecuciones", {
      method: "POST",
    });
    expect(respuesta.status).toBe(200);
    expect((await respuesta.clone().json()).datos.carpetaDescargas).toBe(
      "ventas/",
    );
    expect(listarEjecuciones).toHaveBeenCalledWith(
      "df-1",
      "tenant-1",
      "org-1",
      100,
    );
    expect(ejecutar).toHaveBeenCalledWith({ flujoIdQlik: "df-1", ...sesion });
  });

  it("marca completada una ejecución activa cuando GCS contiene el marcador final", async () => {
    const activa = {
      id: "exec-1",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-1/",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const completada = {
      ...activa,
      estado: "completada",
      finalizadoEn: new Date("2026-08-20T10:05:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([activa])
      .mockResolvedValueOnce([activa])
      .mockResolvedValueOnce([activa])
      .mockResolvedValueOnce([completada]);
    const marcarGcsFinalizada = vi.fn(async () => undefined);
    const estaFinalizada = vi.fn(async () => true);
    const abrirEscritura = vi.fn(
      () =>
        new Writable({
          write(_fragmento, _codificacion, terminar) {
            terminar();
          },
        }),
    );
    const listar = vi.fn(async (prefijo: string) =>
      prefijo.endsWith("__download_cache__/")
        ? []
        : [
            {
              nombre: "fuente.csv",
              rutaCompleta: `${prefijo}fuente.csv`,
              tamanoBytes: 20,
            },
          ],
    );
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          marcarGcsFinalizada,
        } as never,
        resolverAlmacenamiento: async () =>
          ({
            estaFinalizada,
            listar,
            abrirLectura: () => Readable.from(["id\n1\n2\n"]),
            abrirEscritura,
          }) as never,
        resolverMaximoFilasDescarga: async () => 1,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(estaFinalizada).toHaveBeenCalledWith(
      "POCs/TalendDescargados/ventas/exec-1/",
    );
    expect(marcarGcsFinalizada).toHaveBeenCalledWith(
      "exec-1",
      expect.any(Date),
    );
    for (
      let intento = 0;
      intento < 20 && abrirEscritura.mock.calls.length < 3;
      intento++
    )
      await new Promise((resolver) => setTimeout(resolver, 5));
    expect(abrirEscritura).toHaveBeenCalledTimes(3);
    expect((await respuesta.json()).datos[0].estado).toBe("completada");
  });

  it("sincroniza BigQuery para ejecucion con jobIdPrincipalBigQuery y bigqueryProjectId", async () => {
    const execActiva = {
      id: "exec-bq-1",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-bq-1/",
      jobIdPrincipalBigQuery: "job-bq-1",
      bigqueryProjectId: "project-bq-1",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([{ ...execActiva, estado: "completada" }]);
    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockResolvedValue({
        jobId: "job-bq-1",
        projectId: "project-bq-1",
        location: "US",
        estado: "DONE",
        creationTime: "2026-08-20T10:00:00Z",
        startTime: "2026-08-20T10:00:01Z",
        endTime: "2026-08-20T10:00:05Z",
        totalBytesProcessed: "123",
        totalBytesBilled: "100",
        totalSlotMs: "50",
        cacheHit: false,
        statementType: "SELECT",
        errorResult: null,
        parentJobId: null,
      }),
      listarHijos: vi.fn().mockResolvedValue([]),
    };
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          obtenerEjecucionPorId: vi.fn().mockResolvedValue(execActiva),
        } as never,
        resolverAlmacenamiento: async () =>
          ({ estaFinalizada: vi.fn(async () => false) }) as never,
        resolverJobsBigQuery: async () => jobsBigQueryMock as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-bq-1", projectId: "project-bq-1" }),
    );
  });

  it("recupera métricas BigQuery de una ejecución completada sin timestamps", async () => {
    const ejecucion = {
      id: "exec-bq-recuperable",
      estado: "completada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs:
        "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-bq-recuperable/",
      jobIdPrincipalBigQuery: "job-bq-recuperable",
      bigqueryProjectId: "project-bq-1",
      bigqueryLocation: "US",
      bigqueryFinalizadoEn: null,
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const obtenerJob = vi.fn(async () => ({
      jobId: "job-bq-recuperable",
      projectId: "project-bq-1",
      location: "US",
      estado: "DONE" as const,
      creationTime: "2026-08-20T10:00:00Z",
      startTime: "2026-08-20T10:00:01Z",
      endTime: "2026-08-20T10:00:05Z",
      totalBytesProcessed: "123",
      totalBytesBilled: "100",
      totalSlotMs: "50",
      cacheHit: false,
      statementType: "EXPORT_DATA",
      errorResult: null,
      parentJobId: null,
    }));
    const app = appCon(
      { listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]) },
      {
        repositorioReportes: {
          listarEjecuciones: vi.fn(async () => [ejecucion]),
          obtenerEjecucionPorId: vi.fn(async () => ejecucion),
          guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
          actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
        } as never,
        resolverJobsBigQuery: async () =>
          ({ obtenerJob, listarHijos: vi.fn(async () => []) }) as never,
      },
    );

    await app.request("/api/reportes/df-1/ejecuciones");

    expect(obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-bq-recuperable" }),
    );
  });

  it("completa tras confirmar Talend y el job principal BigQuery", async () => {
    const ejecucion = {
      id: "exec-confirmada",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-confirmada/",
      jobIdPrincipalBigQuery: "job-confirmada",
      bigqueryProjectId: "project-bq-1",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const marcarEstadoEjecucion = vi.fn(async () => undefined);
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
        listarEjecuciones: vi.fn(async () => [
          {
            id: "run-1",
            status: "finished",
            stopTime: "2026-08-20T10:00:05Z",
          },
        ]),
        obtenerAutomatizacion: vi.fn(async () => ({
          workspace: {
            blocks: [{ snippet_guid: "087a1ce0-037c-11ee-9163-4dcbc6412d48" }],
          },
        })),
      },
      {
        repositorioReportes: {
          listarEjecuciones: vi.fn(async () => [ejecucion]),
          obtenerEjecucionPorId: vi.fn(async () => ejecucion),
          guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
          actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
          listarJobsBigQueryPorEjecucionIds: vi.fn(
            async () =>
              new Map([
                [
                  "exec-confirmada",
                  [
                    {
                      tipo: "principal",
                      estado: "done",
                      endTime: "2026-08-20T10:00:09Z",
                    },
                  ],
                ],
              ]),
          ),
          marcarEstadoEjecucion,
        } as never,
        resolverJobsBigQuery: async () =>
          ({
            obtenerJob: vi.fn(async () => ({
              jobId: "job-confirmada",
              projectId: "project-bq-1",
              location: "US",
              estado: "DONE",
              creationTime: "2026-08-20T10:00:00Z",
              startTime: "2026-08-20T10:00:01Z",
              endTime: "2026-08-20T10:00:09Z",
              totalBytesProcessed: "1",
              totalBytesBilled: "1",
              totalSlotMs: "1",
              cacheHit: false,
              statementType: "EXPORT_DATA",
              errorResult: null,
              parentJobId: null,
            })),
            listarHijos: vi.fn(async () => []),
          }) as never,
      },
    );

    await app.request("/api/reportes/df-1/ejecuciones");

    expect(marcarEstadoEjecucion).toHaveBeenCalledWith(
      "exec-confirmada",
      "completada",
      new Date("2026-08-20T10:00:09Z"),
    );
  });

  it("reconcilia una cancelación que terminó normalmente como completada", async () => {
    const ejecucion = {
      id: "exec-carrera",
      estado: "cancelando",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-carrera/",
      jobIdPrincipalBigQuery: "job-carrera",
      bigqueryProjectId: "project-bq-1",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const marcarEstadoEjecucion = vi.fn(async () => undefined);
    const ejecuciones = vi.fn(async () => [ejecucion]);
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
        listarEjecuciones: vi.fn(async () => [
          { id: "run-1", status: "finished" },
        ]),
        obtenerAutomatizacion: vi.fn(async () => ({
          workspace: {
            blocks: [{ snippet_guid: "087a1ce0-037c-11ee-9163-4dcbc6412d48" }],
          },
        })),
      },
      {
        repositorioReportes: {
          listarEjecuciones: ejecuciones,
          obtenerEjecucionPorId: vi.fn(async () => ejecucion),
          guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
          actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
          listarJobsBigQueryPorEjecucionIds: vi.fn(
            async () =>
              new Map([
                [
                  "exec-carrera",
                  [
                    {
                      tipo: "principal",
                      estado: "done",
                      endTime: "2026-08-20T10:00:09Z",
                    },
                  ],
                ],
              ]),
          ),
          marcarEstadoEjecucion,
        } as never,
        resolverJobsBigQuery: async () =>
          ({
            obtenerJob: vi.fn(async () => ({
              jobId: "job-carrera",
              projectId: "project-bq-1",
              location: "US",
              estado: "DONE",
              creationTime: "2026-08-20T10:00:00Z",
              startTime: "2026-08-20T10:00:01Z",
              endTime: "2026-08-20T10:00:09Z",
              totalBytesProcessed: "1",
              totalBytesBilled: "1",
              totalSlotMs: "1",
              cacheHit: false,
              statementType: "EXPORT_DATA",
              errorResult: null,
              parentJobId: null,
            })),
            listarHijos: vi.fn(async () => []),
          }) as never,
      },
    );

    await app.request("/api/reportes/df-1/ejecuciones");

    expect(marcarEstadoEjecucion).toHaveBeenCalledWith(
      "exec-carrera",
      "completada",
      expect.any(Date),
    );
  });

  it("calcula la duración total desde el inicio y no desde creadoEn", async () => {
    const ejecucion = {
      id: "exec-duracion",
      estado: "completada",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-duracion/",
      creadoEn: new Date("2026-08-20T05:00:00Z"),
      iniciadoEn: new Date("2026-08-20T10:00:00Z"),
      finalizadoEn: new Date("2026-08-20T10:00:20Z"),
    };
    const app = appCon(
      { listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]) },
      {
        repositorioReportes: {
          listarEjecuciones: vi.fn(async () => [ejecucion]),
          listarJobsBigQueryPorEjecucionIds: vi.fn(async () => new Map()),
        } as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect((await respuesta.json()).datos[0].metricas.duracionTotalMs).toBe(
      20_000,
    );
  });

  it("no detiene el polling cuando sincronizacion BigQuery falla temporalmente", async () => {
    const execActiva = {
      id: "exec-bq-error",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-bq-error/",
      jobIdPrincipalBigQuery: "job-bq-1",
      bigqueryProjectId: "project-bq-1",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([execActiva])
      .mockResolvedValueOnce([execActiva]);
    const jobsBigQueryMock = {
      obtenerJob: vi
        .fn()
        .mockRejectedValue(new Error("BigQuery temporarily unavailable")),
      listarHijos: vi.fn().mockResolvedValue([]),
    };
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          obtenerEjecucionPorId: vi.fn().mockResolvedValue(execActiva),
        } as never,
        resolverAlmacenamiento: async () =>
          ({ estaFinalizada: vi.fn(async () => false) }) as never,
        resolverJobsBigQuery: async () => jobsBigQueryMock as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
  });

  it("persiste gcsFinalizadoEn al detectar marcador GCS y no sobrescribe error especifico de Qlik/Talend", async () => {
    const execConError = {
      id: "exec-error-qlik",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-error-qlik/",
      etapaError: "talend",
      mensajeError: "Talend job failed: connection refused",
      jobIdPrincipalBigQuery: null,
      bigqueryProjectId: null,
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const execGcsFinalizado = {
      ...execConError,
      estado: "completada",
      gcsFinalizadoEn: new Date("2026-08-20T10:05:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([execConError])
      .mockResolvedValueOnce([execConError])
      .mockResolvedValueOnce([execConError])
      .mockResolvedValueOnce([execGcsFinalizado]);
    const marcarGcsFinalizada = vi.fn(async () => undefined);
    const estaFinalizada = vi.fn(async () => true);
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          marcarGcsFinalizada,
        } as never,
        resolverAlmacenamiento: async () => ({ estaFinalizada }) as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(marcarGcsFinalizada).toHaveBeenCalledWith(
      "exec-error-qlik",
      expect.any(Date),
    );
  });

  it("recupera ejecucion persistente tras reinicio: sin estado en memoria, con jobId y runId", async () => {
    const execRecuperada = {
      id: "exec-reinicio",
      estado: "iniciada",
      runIdQlik: "run-recuperado",
      automatizacionIdQlik: "auto-recup",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-reinicio/",
      jobIdPrincipalBigQuery: "job-recup-bq",
      bigqueryProjectId: "project-recup",
      bigqueryLocation: "EU",
      qlikIniciadoEn: new Date("2026-08-25T09:00:00Z"),
      bigqueryIniciadoEn: new Date("2026-08-25T09:00:05Z"),
      bigqueryFinalizadoEn: null,
      gcsFinalizadoEn: null,
      creadoEn: new Date("2026-08-25T09:00:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([execRecuperada])
      .mockResolvedValueOnce([execRecuperada])
      .mockResolvedValueOnce([execRecuperada])
      .mockResolvedValueOnce([{ ...execRecuperada, estado: "completada" }]);
    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockResolvedValue({
        jobId: "job-recup-bq",
        projectId: "project-recup",
        location: "EU",
        estado: "DONE",
        creationTime: "2026-08-25T09:00:00Z",
        startTime: "2026-08-25T09:00:01Z",
        endTime: "2026-08-25T09:00:05Z",
        totalBytesProcessed: "456",
        totalBytesBilled: "200",
        totalSlotMs: "100",
        cacheHit: false,
        statementType: "SELECT",
        errorResult: null,
        parentJobId: null,
      }),
      listarHijos: vi.fn().mockResolvedValue([]),
    };
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          obtenerEjecucionPorId: vi.fn().mockResolvedValue(execRecuperada),
        } as never,
        resolverAlmacenamiento: async () =>
          ({ estaFinalizada: vi.fn(async () => false) }) as never,
        resolverJobsBigQuery: async () => jobsBigQueryMock as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-recup-bq",
        projectId: "project-recup",
      }),
    );
  });

  it("completa ejecucion via GCS cuando BigQuery retorna 404 pero marcador GCS existe", async () => {
    const execBq404 = {
      id: "exec-bq-404",
      estado: "iniciada",
      runIdQlik: "run-1",
      automatizacionIdQlik: "auto-1",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-bq-404/",
      jobIdPrincipalBigQuery: "job-inexistente",
      bigqueryProjectId: "project-bq",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
    };
    const listarEjecuciones = vi
      .fn()
      .mockResolvedValueOnce([execBq404])
      .mockResolvedValueOnce([execBq404])
      .mockResolvedValueOnce([execBq404])
      .mockResolvedValueOnce([{ ...execBq404, estado: "completada" }]);
    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockResolvedValue(null),
      listarHijos: vi.fn().mockResolvedValue([]),
    };
    const marcarGcsFinalizada = vi.fn(async () => undefined);
    const estaFinalizada = vi.fn(async () => true);
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
      },
      {
        repositorioReportes: {
          listarEjecuciones,
          marcarGcsFinalizada,
          obtenerEjecucionPorId: vi.fn().mockResolvedValue(execBq404),
        } as never,
        resolverAlmacenamiento: async () => ({ estaFinalizada }) as never,
        resolverJobsBigQuery: async () => jobsBigQueryMock as never,
      },
    );

    const respuesta = await app.request("/api/reportes/df-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-inexistente",
        projectId: "project-bq",
      }),
    );
    expect(marcarGcsFinalizada).toHaveBeenCalledWith(
      "exec-bq-404",
      expect.any(Date),
    );
  });
});

describe("GET /reportes/:flujoId/preview", () => {
  const SCRIPT_SIMPLE = [
    "LIB CONNECT TO [Google BigQuery:Produccion];",
    "[ventas]: LOAD id, nombre;",
    "SQL SELECT id, nombre FROM `proyecto.dataset.ventas`;",
  ].join("\n");

  const SCRIPT_CON_ERROR = [
    "LIB CONNECT TO [Google BigQuery:Produccion];",
    "[ventas]: LOAD id;",
    "SQL SELECT id FROM `proyecto.dataset.ventas`;",
  ].join("\n");

  it("devuelve 404 cuando el dataflow no existe", async () => {
    const app = appCon({ listarFlujos: vi.fn(async () => []) });
    const respuesta = await app.request("/api/reportes/inexistente/preview");
    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error.codigo).toBe(
      "DATAFLOW_NO_ENCONTRADO",
    );
  });

  it("devuelve 500 cuando preview no está configurado", async () => {
    const app = appCon({
      listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]),
    });
    const respuesta = await app.request("/api/reportes/df-1/preview");
    expect(respuesta.status).toBe(500);
    expect((await respuesta.json()).error.codigo).toBe(
      "PREVIEW_NOT_CONFIGURED",
    );
  });

  it("devuelve datos de preview sin llamar createQueryJob", async () => {
    const obtenerScriptApp = vi.fn(async () => ({
      script: SCRIPT_SIMPLE,
    }));
    const mockBq = {
      obtenerMetadataTabla: vi.fn(async () => ({
        columnas: [
          { nombre: "id", tipo: "INT64", modo: "NULLABLE" },
          { nombre: "nombre", tipo: "STRING", modo: "NULLABLE" },
        ],
      })),
      obtenerFilasPreview: vi.fn(async () => ({
        columnas: ["id", "nombre"],
        filas: [["101", "Proveedor Real"]],
      })),
    };
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          { id: "df-1", appId: "app-1", name: "Ventas", spaceId: "sp-1" },
        ]),
        obtenerScriptApp,
      },
      {
        resolverPreviewBigQuery: async () => ({ clientePreview: mockBq }),
      },
    );
    const respuesta = await app.request("/api/reportes/df-1/preview");
    expect(respuesta.status).toBe(200);
    const datos = (await respuesta.json()).datos;
    expect(datos.esAproximacion).toBe(true);
    expect(datos.filasReferencia).toBeGreaterThan(0);
    expect(datos.fuentesReferencia).toEqual(["proyecto.dataset.ventas"]);
    expect(datos.filas.length).toBeLessThanOrEqual(10);
    expect(mockBq.obtenerMetadataTabla).toHaveBeenCalled();
  });

  it("devuelve advertencias cuando hay fuentes que no se pueden muestrear", async () => {
    const obtenerScriptApp = vi.fn(async () => ({
      script: SCRIPT_CON_ERROR,
    }));
    const mockBq = {
      obtenerMetadataTabla: vi.fn(async () => {
        throw new Error("Tabla no encontrada");
      }),
    };
    const app = appCon(
      {
        listarFlujos: vi.fn(async () => [
          { id: "df-1", appId: "app-1", name: "Ventas" },
        ]),
        obtenerScriptApp,
      },
      {
        resolverPreviewBigQuery: async () => ({ clientePreview: mockBq }),
      },
    );
    const respuesta = await app.request("/api/reportes/df-1/preview");
    expect(respuesta.status).toBe(200);
    const datos = (await respuesta.json()).datos;
    expect(datos.advertencias).toBeDefined();
  });
});

import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import type { PuertoJobsBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { crearRutasDescargas } from "./rutas-descargas.js";

function crearSesionHeaders(sesion: {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
}) {
  return {
    Cookie: "sesion_usuario=test-session-token",
  };
}

describe("GET /api/descargas — BigQuery sync", () => {
  it("sincroniza BigQuery para ejecuciones de todos los flujos distintos sin duplicar", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };

    const execFlujoVentas: Record<string, unknown> = {
      id: "exec-ventas",
      flujoIdQlik: "flujo-ventas",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-ventas",
      estado: "iniciada",
      runIdQlik: "run-ventas",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/exec-ventas/",
      jobIdPrincipalBigQuery: "job-ventas-bq",
      bigqueryProjectId: "project-ventas",
      bigqueryLocation: "US",
      creadoEn: new Date("2026-08-20T10:00:00Z"),
      finalizadoEn: null,
    };
    const execFlujoCompras: Record<string, unknown> = {
      id: "exec-compras",
      flujoIdQlik: "flujo-compras",
      flujoNombreSnapshot: "Compras",
      automatizacionIdQlik: "auto-compras",
      estado: "iniciada",
      runIdQlik: "run-compras",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/compras/exec-compras/",
      jobIdPrincipalBigQuery: "job-compras-bq",
      bigqueryProjectId: "project-compras",
      bigqueryLocation: "EU",
      creadoEn: new Date("2026-08-20T11:00:00Z"),
      finalizadoEn: null,
    };

    const listarEjecucionesDescargas = vi.fn(async () => {
      return [{ ...execFlujoVentas }, { ...execFlujoCompras }];
    });

    const listarEjecucionesPorFlujo = vi
      .fn()
      .mockImplementation(async (flujoIdQlik: string) => {
        if (flujoIdQlik === "flujo-ventas") return [{ ...execFlujoVentas }];
        if (flujoIdQlik === "flujo-compras") return [{ ...execFlujoCompras }];
        return [];
      });

    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockResolvedValue({
        jobId: "",
        projectId: "",
        location: "US",
        estado: "DONE",
        creationTime: "",
        startTime: null,
        endTime: null,
        totalBytesProcessed: null,
        totalBytesBilled: null,
        totalSlotMs: null,
        cacheHit: null,
        statementType: null,
        errorResult: null,
        parentJobId: null,
      }),
      listarHijos: vi.fn().mockResolvedValue([]),
    };

    const listarQlik = vi.fn().mockResolvedValue([]);

    const resolverJobsBigQuerySpy = vi.fn(
      async () => jobsBigQueryMock as unknown as PuertoJobsBigQuery,
    );
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () =>
        ({ listarEjecuciones: listarQlik }) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        listarEjecuciones: listarEjecucionesPorFlujo,
        obtenerEjecucionPorId: vi
          .fn()
          .mockImplementation(async (id: string) => {
            if (id === "exec-ventas")
              return { ...execFlujoVentas, id: "exec-ventas" };
            if (id === "exec-compras")
              return { ...execFlujoCompras, id: "exec-compras" };
            return null;
          }),
        guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
        actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => true,
        }) as unknown as PuertoAlmacenamientoDescargas,
      resolverJobsBigQuery: resolverJobsBigQuerySpy,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });

    expect(respuesta.status).toBe(200);
    expect(listarEjecucionesPorFlujo).toHaveBeenCalledTimes(4);
    expect(resolverJobsBigQuerySpy).toHaveBeenCalled();
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledTimes(2);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-ventas",
        jobId: "job-ventas-bq",
      }),
    );
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-compras",
        jobId: "job-compras-bq",
      }),
    );
  });

  it("no se cae si un flujo no tiene ejecucion con job BQ", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };

    const execConBq: Record<string, unknown> = {
      id: "exec-bq",
      flujoIdQlik: "flujo-bq",
      flujoNombreSnapshot: "Con BQ",
      automatizacionIdQlik: "auto-bq",
      estado: "iniciada",
      runIdQlik: "run-bq",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/bq/exec-bq/",
      jobIdPrincipalBigQuery: "job-bq",
      bigqueryProjectId: "project-bq",
      bigqueryLocation: "US",
      creadoEn: new Date(),
      finalizadoEn: null,
    };
    const execSinBq: Record<string, unknown> = {
      id: "exec-sin-bq",
      flujoIdQlik: "flujo-sin-bq",
      flujoNombreSnapshot: "Sin BQ",
      automatizacionIdQlik: "auto-sin-bq",
      estado: "iniciada",
      runIdQlik: "run-sin-bq",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/sinbq/exec-sin-bq/",
      jobIdPrincipalBigQuery: null,
      bigqueryProjectId: null,
      bigqueryLocation: null,
      creadoEn: new Date(),
      finalizadoEn: null,
    };

    const listarEjecucionesDescargas = vi.fn(async () => [
      { ...execConBq },
      { ...execSinBq },
    ]);

    const listarEjecucionesPorFlujo = vi
      .fn()
      .mockImplementation(async (flujoIdQlik: string) => {
        if (flujoIdQlik === "flujo-bq") return [{ ...execConBq }];
        if (flujoIdQlik === "flujo-sin-bq") return [{ ...execSinBq }];
        return [];
      });

    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockResolvedValue({
        jobId: "job-bq",
        projectId: "project-bq",
        location: "US",
        estado: "DONE",
        creationTime: "",
        startTime: null,
        endTime: null,
        totalBytesProcessed: null,
        totalBytesBilled: null,
        totalSlotMs: null,
        cacheHit: null,
        statementType: null,
        errorResult: null,
        parentJobId: null,
      }),
      listarHijos: vi.fn().mockResolvedValue([]),
    };

    const listarQlik = vi.fn().mockResolvedValue([]);
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () =>
        ({ listarEjecuciones: listarQlik }) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        listarEjecuciones: listarEjecucionesPorFlujo,
        obtenerEjecucionPorId: vi
          .fn()
          .mockImplementation(async (id: string) => {
            if (id === "exec-bq") return { ...execConBq, id: "exec-bq" };
            return null;
          }),
        guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
        actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => true,
        }) as unknown as PuertoAlmacenamientoDescargas,
      resolverJobsBigQuery: async () =>
        jobsBigQueryMock as unknown as PuertoJobsBigQuery,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });

    expect(respuesta.status).toBe(200);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledTimes(1);
    expect(jobsBigQueryMock.obtenerJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-bq" }),
    );
  });

  it("no se cae si la sincronizacion BigQuery de una ejecucion falla", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };

    const execFallida: Record<string, unknown> = {
      id: "exec-falla",
      flujoIdQlik: "flujo-falla",
      flujoNombreSnapshot: "Fallida",
      automatizacionIdQlik: "auto-falla",
      estado: "iniciada",
      runIdQlik: "run-falla",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/falla/exec-falla/",
      jobIdPrincipalBigQuery: "job-falla",
      bigqueryProjectId: "project-falla",
      bigqueryLocation: "US",
      creadoEn: new Date(),
      finalizadoEn: null,
    };

    const listarEjecucionesDescargas = vi.fn(async () => [{ ...execFallida }]);

    const listarEjecucionesPorFlujo = vi
      .fn()
      .mockResolvedValue([{ ...execFallida }]);

    const jobsBigQueryMock = {
      obtenerJob: vi.fn().mockRejectedValue(new Error("BigQuery unavailable")),
      listarHijos: vi.fn().mockResolvedValue([]),
    };

    const listarQlik = vi.fn().mockResolvedValue([]);
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () =>
        ({ listarEjecuciones: listarQlik }) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        listarEjecuciones: listarEjecucionesPorFlujo,
        obtenerEjecucionPorId: vi
          .fn()
          .mockResolvedValue({ ...execFallida, id: "exec-falla" }),
        guardarJobBigQueryEjecucion: vi.fn(async () => undefined),
        actualizarTimestampsEjecucionBigQuery: vi.fn(async () => undefined),
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => true,
        }) as unknown as PuertoAlmacenamientoDescargas,
      resolverJobsBigQuery: async () =>
        jobsBigQueryMock as unknown as PuertoJobsBigQuery,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });

    expect(respuesta.status).toBe(200);
  });
});

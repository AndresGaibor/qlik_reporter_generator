import { describe, expect, it, vi } from "bun:test";
import type {
  MetadatoJobBigQuery,
  PuertoJobsBigQuery,
} from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type {
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
} from "./puertos/puerto-repositorio-reportes.js";

function metadatoJobBigQuery(
  overrides: Partial<MetadatoJobBigQuery> = {},
): MetadatoJobBigQuery {
  return {
    jobId: "job-1",
    projectId: "project-1",
    location: "US",
    estado: "DONE",
    creationTime: "2026-08-25T10:00:00.000Z",
    startTime: "2026-08-25T10:00:01.000Z",
    endTime: "2026-08-25T10:00:05.000Z",
    totalBytesProcessed: "1234567890",
    totalBytesBilled: "1000000",
    totalSlotMs: "50000000000",
    cacheHit: false,
    statementType: "SELECT",
    errorResult: null,
    parentJobId: null,
    ...overrides,
  };
}

function ejecucionPersistida(): EjecucionReportePersistida {
  return {
    id: "exec-1",
    organizacionId: "org-1",
    tenantQlikId: "tenant-1",
    flujoIdQlik: "flujo-1",
    flujoNombreSnapshot: "Flujo Test",
    automatizacionIdQlik: "auto-1",
    hashDataflowSha256: "abc123",
    scriptDataflow: "script",
    sqlBigQueryCompilado: "SELECT 1",
    scriptExportacion: "export",
    uriBaseGcs: "gs://bucket/path",
    estado: "iniciada",
    versionCompilador: 1,
    jobIdPrincipalBigQuery: "job-1",
    bigqueryProjectId: "project-1",
    bigqueryLocation: "US",
    qlikIniciadoEn: new Date("2026-08-25T09:55:00.000Z"),
    bigqueryIniciadoEn: null,
    bigqueryFinalizadoEn: null,
    gcsFinalizadoEn: null,
    iniciadoEn: new Date("2026-08-25T09:55:00.000Z"),
    finalizadoEn: null,
    creadoEn: new Date("2026-08-25T09:50:00.000Z"),
  };
}

describe("SincronizarJobsBigQueryEjecucion", () => {
  describe("sincronizar", () => {
    it("persiste job RUNNING con estado running", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(
        metadatoJobBigQuery({
          estado: "RUNNING",
          startTime: null,
          endTime: null,
        }),
      );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      expect(repoReportes.guardarJobBigQueryEjecucion).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: "running",
          jobId: "job-1",
          duracionMs: null,
        }),
      );
    });

    it("persiste job DONE sin error con estado done y duracion calculada", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(metadatoJobBigQuery());
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      const call = repoReportes.guardarJobBigQueryEjecucion.mock.calls[0][0];
      expect(call.estado).toBe("done");
      expect(call.startTime).toBe("2026-08-25T10:00:01.000Z");
      expect(call.endTime).toBe("2026-08-25T10:00:05.000Z");
      expect(call.duracionMs).toBe(4000);
    });

    it("persiste job DONE con errorResult como estado error con reason y message", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(
        metadatoJobBigQuery({
          estado: "DONE",
          errorResult: {
            reason: "rateLimitExceeded",
            message: "Rate limit exceeded",
          },
        }),
      );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      const call = repoReportes.guardarJobBigQueryEjecucion.mock.calls[0][0];
      expect(call.estado).toBe("error");
      expect(call.errorReason).toBe("rateLimitExceeded");
      expect(call.errorMessage).toBe("Rate limit exceeded");
    });

    it("no marca error ni cambia estado si el job no existe (404/null)", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(null);
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      expect(repoReportes.guardarJobBigQueryEjecucion).not.toHaveBeenCalled();
    });

    it("propaga errores distintos de 404 para permitir reintentos", async () => {
      const { sincronizar, jobsBigQuery } = setup();
      jobsBigQuery.obtenerJob.mockRejectedValue(
        new Error("Connection timeout"),
      );

      await expect(sincronizar.sincronizar("exec-1")).rejects.toThrow(
        "Connection timeout",
      );
    });

    it("persiste jobs hijos con parentJobId configurado", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(metadatoJobBigQuery());
      jobsBigQuery.listarHijos.mockResolvedValue([
        metadatoJobBigQuery({
          jobId: "child-job-1",
          parentJobId: "job-1",
          creationTime: "2026-08-25T10:00:00.500Z",
        }),
        metadatoJobBigQuery({
          jobId: "child-job-2",
          parentJobId: "job-1",
          creationTime: "2026-08-25T10:00:00.600Z",
        }),
      ]);

      await sincronizar.sincronizar("exec-1");

      const calls = repoReportes.guardarJobBigQueryEjecucion.mock.calls;
      const childCalls = calls.filter((c) =>
        c[0].jobId.startsWith("child-job"),
      );
      expect(childCalls).toHaveLength(2);
      for (const call of childCalls) {
        expect(call[0].parentJobId).toBe("job-1");
        expect(call[0].tipo).toBe("child");
      }
    });

    it("es idempotente: repetir sincronizacion no duplica jobs", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(metadatoJobBigQuery());
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");
      await sincronizar.sincronizar("exec-1");

      expect(repoReportes.guardarJobBigQueryEjecucion).toHaveBeenCalledTimes(2);
    });

    it("mantiene bytes y slot-ms como strings sin conversion a number", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(
        metadatoJobBigQuery({
          totalBytesProcessed: "1234567890123456789",
          totalBytesBilled: "1000000",
          totalSlotMs: "50000000000",
        }),
      );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      const call = repoReportes.guardarJobBigQueryEjecucion.mock.calls[0][0];
      expect(call.totalBytesProcessed).toBe("1234567890123456789");
      expect(call.totalBytesBilled).toBe("1000000");
      expect(call.totalSlotMs).toBe("50000000000");
    });

    it("actualiza timestamps globales de ejecucion BigQuery cuando startTime y endTime existen", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(metadatoJobBigQuery());
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      expect(
        repoReportes.actualizarTimestampsEjecucionBigQuery,
      ).toHaveBeenCalledWith(
        "exec-1",
        expect.objectContaining({
          bigqueryIniciadoEn: new Date("2026-08-25T10:00:01.000Z"),
          bigqueryFinalizadoEn: new Date("2026-08-25T10:00:05.000Z"),
        }),
      );
    });

    it("no actualiza timestamps globales si startTime es null (job RUNNING)", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(
        metadatoJobBigQuery({ startTime: null, endTime: null }),
      );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      expect(
        repoReportes.actualizarTimestampsEjecucionBigQuery,
      ).not.toHaveBeenCalled();
    });

    it("usa location del metadata si existe, sino la persistida, sino US", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob.mockResolvedValue(
        metadatoJobBigQuery({ location: "EU" }),
      );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");

      const call = repoReportes.guardarJobBigQueryEjecucion.mock.calls[0][0];
      expect(call.location).toBe("EU");
    });

    it("no tiene estado en memoria entre llamadas", async () => {
      const { sincronizar, jobsBigQuery, repoReportes } = setup();
      jobsBigQuery.obtenerJob
        .mockResolvedValueOnce(
          metadatoJobBigQuery({
            jobId: "job-1",
            estado: "RUNNING",
            startTime: null,
            endTime: null,
          }),
        )
        .mockResolvedValueOnce(
          metadatoJobBigQuery({
            jobId: "job-1",
            estado: "DONE",
            startTime: "2026-08-25T10:00:01.000Z",
            endTime: "2026-08-25T10:00:05.000Z",
          }),
        );
      jobsBigQuery.listarHijos.mockResolvedValue([]);

      await sincronizar.sincronizar("exec-1");
      await sincronizar.sincronizar("exec-1");

      const calls = repoReportes.guardarJobBigQueryEjecucion.mock.calls;
      expect(calls[0][0].estado).toBe("running");
      expect(calls[1][0].estado).toBe("done");
      expect(calls[1][0].duracionMs).toBe(4000);
    });
  });
});

function setup() {
  const repoReportes = {
    obtenerEjecucionPorJobId:
      vi.fn<() => Promise<EjecucionReportePersistida | null>>(),
    obtenerEjecucionPorId:
      vi.fn<() => Promise<EjecucionReportePersistida | null>>(),
    guardarJobBigQueryEjecucion: vi.fn<() => Promise<void>>(),
    listarJobsBigQueryPorEjecucion: vi.fn<() => Promise<unknown[]>>(),
    actualizarTimestampsEjecucionBigQuery: vi.fn<() => Promise<void>>(),
  } as unknown as PuertoRepositorioReportes & {
    obtenerEjecucionPorJobId: ReturnType<typeof vi.fn>;
    obtenerEjecucionPorId: ReturnType<typeof vi.fn>;
    guardarJobBigQueryEjecucion: ReturnType<typeof vi.fn>;
    listarJobsBigQueryPorEjecucion: ReturnType<typeof vi.fn>;
    actualizarTimestampsEjecucionBigQuery: ReturnType<typeof vi.fn>;
  };

  repoReportes.obtenerEjecucionPorId.mockResolvedValue(ejecucionPersistida());

  const jobsBigQuery = {
    obtenerJob: vi.fn<() => Promise<MetadatoJobBigQuery | null>>(),
    listarHijos: vi.fn<() => Promise<MetadatoJobBigQuery[]>>(),
  } as unknown as PuertoJobsBigQuery & {
    obtenerJob: ReturnType<typeof vi.fn>;
    listarHijos: ReturnType<typeof vi.fn>;
  };

  const {
    SincronizarJobsBigQueryEjecucion,
  } = require("./sincronizar-jobs-bigquery-ejecucion.js");
  const sincronizar = new SincronizarJobsBigQueryEjecucion(
    repoReportes,
    jobsBigQuery,
  );

  return { sincronizar, jobsBigQuery, repoReportes };
}

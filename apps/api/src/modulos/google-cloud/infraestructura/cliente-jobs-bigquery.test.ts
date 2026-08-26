import { describe, expect, it, vi } from "bun:test";
import type { BigQuery } from "@google-cloud/bigquery";

function crearJobMock(metadata: Record<string, unknown>) {
  return {
    getMetadata: vi.fn(async () => [metadata]),
  };
}

function crearClienteMock(jobMock: ReturnType<typeof crearJobMock>) {
  return {
    job: vi.fn(() => jobMock),
    getJobs: vi.fn(),
  } as unknown as BigQuery;
}

describe("ClienteJobsBigQuery", () => {
  describe("obtenerJob", () => {
    it("retorna null cuando el job lanza error (404)", async () => {
      const jobMock = {
        getMetadata: vi.fn(async () => {
          const error = new Error("Not found") as Error & { code: number };
          error.code = 404;
          throw error;
        }),
      };
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-nonexistent",
        location: "US",
      });

      expect(resultado).toBeNull();
    });

    it("propaga errores distintos de 404", async () => {
      const jobMock = {
        getMetadata: vi.fn(async () => {
          throw new Error("Connection timeout");
        }),
      };
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );

      await expect(
        cliente.obtenerJob({
          projectId: "project-1",
          jobId: "job-1",
          location: "US",
        }),
      ).rejects.toThrow("Connection timeout");
    });

    it("mapea correctamente metadata de job DONE sin errores", async () => {
      const rawMetadata = {
        jobReference: {
          projectId: "project-1",
          jobId: "job-1",
          location: "EU",
        },
        statistics: {
          creationTime: "2026-08-25T10:00:00.000Z",
          startTime: "2026-08-25T10:00:01.000Z",
          endTime: "2026-08-25T10:00:05.000Z",
          query: {
            totalBytesProcessed: "1234567890",
            totalBytesBilled: "1000000",
            cacheHit: false,
            statementType: "SELECT",
          },
          totalSlotMs: "50000000000",
        },
        status: {
          state: "DONE",
          errorResult: null,
        },
      };

      const jobMock = crearJobMock(rawMetadata);
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-1",
      });

      expect(resultado).toEqual({
        jobId: "job-1",
        projectId: "project-1",
        location: "EU",
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
      });
    });

    it("convierte timestamps BigQuery en milisegundos a ISO", async () => {
      const jobMock = crearJobMock({
        jobReference: { projectId: "project-1", jobId: "job-1" },
        statistics: {
          creationTime: "1787763896609",
          startTime: "1787763896822",
          endTime: "1787763914498",
          query: {},
        },
        status: { state: "DONE" },
      });
      const cliente = new (await import("./cliente-jobs-bigquery.js"))
        .ClienteJobsBigQuery({ projectId: "project-1" }, crearClienteMock(jobMock));

      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-1",
      });

      expect(resultado?.startTime).toBe("2026-08-26T17:04:56.822Z");
      expect(resultado?.endTime).toBe("2026-08-26T17:05:14.498Z");
    });

    it("mapea job con errorResult", async () => {
      const rawMetadata = {
        jobReference: {
          projectId: "project-1",
          jobId: "job-error",
          location: "US",
        },
        statistics: {
          creationTime: "2026-08-25T10:00:00.000Z",
          startTime: "2026-08-25T10:00:01.000Z",
          endTime: "2026-08-25T10:00:05.000Z",
          query: {},
        },
        status: {
          state: "DONE",
          errorResult: {
            reason: "rateLimitExceeded",
            message: "Rate limit exceeded",
          },
        },
      };

      const jobMock = crearJobMock(rawMetadata);
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-error",
      });

      expect(resultado?.errorResult).toEqual({
        reason: "rateLimitExceeded",
        message: "Rate limit exceeded",
      });
      expect(resultado?.estado).toBe("DONE");
    });

    it("usa location del constructor si no existe en metadata", async () => {
      const rawMetadata = {
        jobReference: {
          projectId: "project-1",
          jobId: "job-1",
        },
        statistics: {
          creationTime: "2026-08-25T10:00:00.000Z",
          query: {},
        },
        status: {
          state: "RUNNING",
        },
      };

      const jobMock = crearJobMock(rawMetadata);
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-1",
        location: "EU",
      });

      expect(resultado?.location).toBe("EU");
    });

    it("usa US como location por defecto cuando no hay ni metadata ni input", async () => {
      const rawMetadata = {
        jobReference: {
          projectId: "project-1",
          jobId: "job-1",
        },
        statistics: {
          creationTime: "2026-08-25T10:00:00.000Z",
          query: {},
        },
        status: {
          state: "PENDING",
        },
      };

      const jobMock = crearJobMock(rawMetadata);
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-1",
      });

      expect(resultado?.location).toBe("US");
    });

    it("mantiene bytes y slot-ms como strings sin conversion a number", async () => {
      const rawMetadata = {
        jobReference: {
          projectId: "project-1",
          jobId: "job-large",
          location: "US",
        },
        statistics: {
          creationTime: "2026-08-25T10:00:00.000Z",
          startTime: "2026-08-25T10:00:01.000Z",
          endTime: "2026-08-25T10:00:05.000Z",
          query: {
            totalBytesProcessed: "1234567890123456789",
            totalBytesBilled: "1000000",
          },
          totalSlotMs: "50000000000",
        },
        status: {
          state: "DONE",
        },
      };

      const jobMock = crearJobMock(rawMetadata);
      const clienteMock = crearClienteMock(jobMock);

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.obtenerJob({
        projectId: "project-1",
        jobId: "job-large",
      });

      expect(resultado?.totalBytesProcessed).toBe("1234567890123456789");
      expect(resultado?.totalBytesBilled).toBe("1000000");
      expect(resultado?.totalSlotMs).toBe("50000000000");
      expect(typeof resultado?.totalBytesProcessed).toBe("string");
    });
  });

  describe("listarHijos", () => {
    it("retorna array vacio cuando no hay jobs hijos", async () => {
      const clienteMock = {
        job: vi.fn(),
        getJobs: vi.fn(async () => [[]]),
      } as unknown as BigQuery;

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.listarHijos({
        projectId: "project-1",
        parentJobId: "parent-job-1",
        location: "US",
      });

      expect(resultado).toEqual([]);
    });

    it("mapea hijos correctamente con parentJobId", async () => {
      const rows = [
        {
          jobReference: {
            projectId: "project-1",
            jobId: "child-job-1",
            location: "US",
            parentJobId: "parent-job-1",
          },
          statistics: {
            creationTime: "2026-08-25T10:00:00.500Z",
            query: { totalBytesProcessed: "100" },
          },
          status: { state: "DONE" },
        },
      ];

      const clienteMock = {
        job: vi.fn(),
        getJobs: vi.fn(async () => [rows]),
      } as unknown as BigQuery;

      const { ClienteJobsBigQuery } = await import(
        "./cliente-jobs-bigquery.js"
      );
      const cliente = new ClienteJobsBigQuery(
        { projectId: "project-1" },
        clienteMock as never,
      );
      const resultado = await cliente.listarHijos({
        projectId: "project-1",
        parentJobId: "parent-job-1",
        location: "US",
      });

      expect(resultado).toHaveLength(1);
      expect(resultado[0].jobId).toBe("child-job-1");
      expect(resultado[0].parentJobId).toBe("parent-job-1");
    });
  });
});

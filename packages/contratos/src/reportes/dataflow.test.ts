import { describe, expect, it } from "bun:test";
import {
  esquemaDetalleEjecucionReporte,
  esquemaResumenReporte,
} from "./dataflow.js";

const UUID_EJECUCION = "d5f3a111-1111-1111-1111-111111111111";
const UUID_ORG = "a2b3c444-4444-4444-4444-444444444444";
const UUID_TENANT = "b3c4d555-5555-5555-5555-555555555555";

const baseEjecucionValida = {
  id: UUID_EJECUCION,
  organizacionId: UUID_ORG,
  tenantQlikId: UUID_TENANT,
  flujoIdQlik: "df-1",
  flujoNombreSnapshot: "Ventas",
  flujoEspacioIdQlik: null,
  automatizacionIdQlik: "auto-1",
  runIdQlik: null,
  ejecutadoPorUsuarioId: null,
  automatizacionPersonalId: null,
  hashDataflowSha256: "a".repeat(64),
  scriptDataflow: "LOAD id;",
  sqlBigQueryCompilado: "SELECT 1;",
  scriptExportacion: "EXPORT;",
  uriBaseGcs: "gs://bucket/prefix/",
  estado: "completada" as const,
  versionCompilador: 1,
  etapaError: null,
  mensajeError: null,
  iniciadoEn: null,
  finalizadoEn: null,
  creadoEn: "2026-08-20T10:00:00.000Z",
};

describe("contratos de reportes Dataflow", () => {
  it("representa el catálogo Qlik sin estado local", () => {
    const resultado = esquemaResumenReporte.parse({
      id: "df-1",
      nombre: "Ventas",
      espacioId: "sp-1",
      espacioNombre: "Comercial",
      modificadoEn: "2026-08-19T00:00:00.000Z",
      creadoEn: "2026-08-10T00:00:00.000Z",
      ultimaEjecucionEn: "2026-08-20T12:00:00.000Z",
    });

    expect(resultado.creadoEn).toBe("2026-08-10T00:00:00.000Z");
    expect(resultado.ultimaEjecucionEn).toBe("2026-08-20T12:00:00.000Z");
    expect(resultado).not.toHaveProperty("activa");
  });

  it("no acepta ejecuciones que dependan de reporteId local", () => {
    expect(
      esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        reporteId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  describe("campos de trazabilidad BigQuery", () => {
    it("acepta null en jobIdBigQuery cuando no hay job BigQuery", () => {
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: null,
        bigQueryProjectId: null,
        bigQueryLocation: null,
      });
      expect(resultado.success).toBe(true);
    });

    it("acepta strings grandes en totalBytesProcessed (no convierte a number)", () => {
      const bytesGigantes = "99999999999999999999";
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: "job-bq-1",
        bigQueryProjectId: "project-1",
        bigQueryLocation: "US",
        metricas: {
          duracionTotalMs: 5000,
          duracionBigQueryMs: 3000,
          totalBytesProcessed: bytesGigantes,
          totalBytesBilled: "1234567890",
          totalSlotMs: "9876543210",
        },
      });
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.metricas.totalBytesProcessed).toBe(bytesGigantes);
        expect(typeof resultado.data.metricas.totalBytesProcessed).toBe(
          "string",
        );
      }
    });

    it("acepta null en todos los campos metricas cuando no hay datos", () => {
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: null,
        metricas: null,
      });
      expect(resultado.success).toBe(true);
    });

    it("acepta arreglo jobsBigQuery con job hijo (parentJobId no nulo)", () => {
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: "job-principal",
        bigQueryProjectId: "project-1",
        bigQueryLocation: "EU",
        jobsBigQuery: [
          {
            jobId: "job-principal",
            parentJobId: null,
            tipo: "principal",
            estado: "done",
            startTime: "2026-08-20T10:00:01.000Z",
            endTime: "2026-08-20T10:00:05.000Z",
            duracionMs: 4000,
            totalBytesProcessed: "123",
            totalBytesBilled: "100",
            totalSlotMs: "50",
          },
          {
            jobId: "job-hijo-1",
            parentJobId: "job-principal",
            tipo: "query",
            estado: "done",
            startTime: "2026-08-20T10:00:02.000Z",
            endTime: "2026-08-20T10:00:03.000Z",
            duracionMs: 1000,
            totalBytesProcessed: "50",
            totalBytesBilled: "40",
            totalSlotMs: "20",
          },
        ],
      });
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.jobsBigQuery).toHaveLength(2);
        expect(resultado.data.jobsBigQuery[1].parentJobId).toBe(
          "job-principal",
        );
      }
    });

    it(" Rechaza metricas con bytes como number (debe ser string para precision)", () => {
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: "job-bq-1",
        metricas: {
          duracionTotalMs: 5000,
          duracionBigQueryMs: 3000,
          totalBytesProcessed: 123 as unknown as string,
          totalBytesBilled: "100",
          totalSlotMs: "50",
        },
      });
      expect(resultado.success).toBe(false);
    });

    it("acepta duracionMs null en job cuando no ha terminado", () => {
      const resultado = esquemaDetalleEjecucionReporte.safeParse({
        ...baseEjecucionValida,
        jobIdBigQuery: "job-running",
        jobsBigQuery: [
          {
            jobId: "job-running",
            parentJobId: null,
            tipo: "principal",
            estado: "running",
            startTime: "2026-08-20T10:00:01.000Z",
            endTime: null,
            duracionMs: null,
            totalBytesProcessed: null,
            totalBytesBilled: null,
            totalSlotMs: null,
          },
        ],
      });
      expect(resultado.success).toBe(true);
    });
  });
});

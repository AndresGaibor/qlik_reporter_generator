import { describe, expect, it } from "bun:test";
import type { MetadatoJobBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import { analizarProgresoBigQuery } from "./analizar-progreso-bigquery.js";

const job = (
  overrides: Partial<MetadatoJobBigQuery> = {},
): MetadatoJobBigQuery => ({
  jobId: "job",
  projectId: "project",
  location: "US",
  estado: "RUNNING",
  creationTime: "2026-01-01T00:00:00.000Z",
  startTime: "2026-01-01T00:00:00.000Z",
  endTime: null,
  totalBytesProcessed: null,
  totalBytesBilled: null,
  totalSlotMs: null,
  cacheHit: null,
  statementType: "SELECT",
  errorResult: null,
  timeline: [],
  queryPlan: [],
  parentJobId: null,
  ...overrides,
});

describe("analizarProgresoBigQuery", () => {
  it("muestra preparación sin job", () => {
    expect(
      analizarProgresoBigQuery({
        estadoEjecucion: "preparando",
        job: null,
        iniciadoEn: null,
      })?.fase,
    ).toBe("preparando");
  });
  it("muestra cancelación", () => {
    expect(
      analizarProgresoBigQuery({
        estadoEjecucion: "cancelando",
        job: null,
        iniciadoEn: null,
      })?.fase,
    ).toBe("cancelando");
  });
  it("detecta demanda y volumen inusual", () => {
    const resultado = analizarProgresoBigQuery({
      estadoEjecucion: "iniciada",
      iniciadoEn: new Date(),
      job: job({
        timeline: [
          {
            elapsedMs: "1",
            totalSlotMs: "1",
            pendingUnits: null,
            completedUnits: "1",
            activeUnits: null,
            estimatedRunnableUnits: "2",
          },
        ],
        queryPlan: [
          {
            id: "1",
            name: null,
            status: "RUNNING",
            recordsRead: "1000",
            recordsWritten: "10000",
            slotMs: null,
            waitMsAvg: null,
            readMsAvg: null,
            computeMsAvg: null,
            writeMsAvg: null,
            pasos: ["READ"],
          },
        ],
      }),
    });
    expect(resultado).toMatchObject({
      altaDemanda: true,
      volumenInusual: true,
      fase: "leyendo",
    });
  });
});

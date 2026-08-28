import { BigQuery } from "@google-cloud/bigquery";
import type {
  MetadatoJobBigQuery,
  PuertoJobsBigQuery,
} from "../aplicacion/puerto-jobs-bigquery.js";

export interface OpcionesClienteJobsBigQuery {
  projectId: string;
  credencialesJson?: string;
}

export class ClienteJobsBigQuery implements PuertoJobsBigQuery {
  private readonly cliente: BigQuery;

  constructor(
    opciones: OpcionesClienteJobsBigQuery,
    clienteBigQuery?: BigQuery,
  ) {
    if (!opciones.projectId.trim()) {
      throw new Error("El projectId de BigQuery es obligatorio");
    }
    if (clienteBigQuery) {
      this.cliente = clienteBigQuery;
    } else {
      const credenciales = opciones.credencialesJson
        ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
        : undefined;
      this.cliente = new BigQuery({
        projectId: opciones.projectId.trim(),
        ...(credenciales ? { credentials: credenciales } : {}),
      });
    }
  }

  async obtenerJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery | null> {
    const location = input.location ?? undefined;
    const job = this.cliente.job(input.jobId, { location });
    try {
      const [m] = await job.getMetadata();
      return this.mapearJob(
        m as Record<string, unknown>,
        input.projectId,
        location,
      );
    } catch (err) {
      const error = err as Error & { code?: number };
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async cancelarJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<void> {
    const job = this.cliente.job(input.jobId, {
      location: input.location ?? undefined,
    });
    try {
      await job.cancel();
    } catch (err) {
      const error = err as Error & {
        code?: number;
        errors?: Array<{ reason?: string }>;
      };
      const razon = error.errors?.[0]?.reason;
      if (error.code === 404 || razon === "jobComplete") return;
      throw error;
    }
  }

  async listarHijos(input: {
    projectId: string;
    parentJobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery[]> {
    const options: Record<string, unknown> = {
      location: input.location ?? undefined,
      parentJobId: input.parentJobId,
    };
    const [rows] = await this.cliente.getJobs(options);
    return (rows ?? []).map((r) =>
      this.mapearJob(
        r as unknown as Record<string, unknown>,
        input.projectId,
        input.location,
      ),
    );
  }

  private mapearJob(
    m: Record<string, unknown>,
    projectId: string,
    location: string | undefined,
  ): MetadatoJobBigQuery {
    const ref = (m.jobReference ?? {}) as Record<string, unknown>;
    const stats = (m.statistics ?? {}) as Record<string, unknown>;
    const queryStats = (stats.query ?? {}) as Record<string, unknown>;
    const status = (m.status ?? {}) as Record<string, unknown>;
    const errorResult = (status.errorResult ?? null) as Record<
      string,
      unknown
    > | null;

    return {
      jobId: String(ref.jobId ?? ""),
      projectId: String(ref.projectId ?? projectId),
      location: String(ref.location ?? location ?? "US"),
      estado: (status.state as MetadatoJobBigQuery["estado"]) ?? "PENDING",
      creationTime: normalizarTimestampBigQuery(stats.creationTime) ?? "",
      startTime: normalizarTimestampBigQuery(stats.startTime),
      endTime: normalizarTimestampBigQuery(stats.endTime),
      totalBytesProcessed:
        queryStats.totalBytesProcessed != null
          ? String(queryStats.totalBytesProcessed)
          : null,
      totalBytesBilled:
        queryStats.totalBytesBilled != null
          ? String(queryStats.totalBytesBilled)
          : null,
      totalSlotMs: stats.totalSlotMs != null ? String(stats.totalSlotMs) : null,
      cacheHit:
        queryStats.cacheHit != null ? Boolean(queryStats.cacheHit) : null,
      statementType: queryStats.statementType
        ? String(queryStats.statementType)
        : null,
      errorResult: errorResult
        ? {
            reason: String(errorResult.reason ?? "Unknown"),
            message: String(errorResult.message ?? ""),
          }
        : null,
      timeline: mapearTimeline(stats.timeline),
      queryPlan: mapearQueryPlan(queryStats.queryPlan),
      parentJobId: ref.parentJobId ? String(ref.parentJobId) : null,
    };
  }
}

function mapearTimeline(valor: unknown): MetadatoJobBigQuery["timeline"] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item) => {
    const fila = (item ?? {}) as Record<string, unknown>;
    return {
      elapsedMs: texto(fila.elapsedMs),
      totalSlotMs: texto(fila.totalSlotMs),
      pendingUnits: texto(fila.pendingUnits),
      completedUnits: texto(fila.completedUnits),
      activeUnits: texto(fila.activeUnits),
      estimatedRunnableUnits: texto(fila.estimatedRunnableUnits),
    };
  });
}

function mapearQueryPlan(valor: unknown): MetadatoJobBigQuery["queryPlan"] {
  if (!Array.isArray(valor)) return [];
  return valor.map((item, indice) => {
    const fila = (item ?? {}) as Record<string, unknown>;
    const pasos = Array.isArray(fila.steps)
      ? fila.steps.flatMap((step) => {
          const tipo = (step as Record<string, unknown>)?.kind;
          return tipo ? [String(tipo)] : [];
        })
      : [];
    return {
      id: String(fila.id ?? indice),
      name: texto(fila.name),
      status: texto(fila.status),
      recordsRead: texto(fila.recordsRead),
      recordsWritten: texto(fila.recordsWritten),
      slotMs: texto(fila.slotMs),
      waitMsAvg: texto(fila.waitMsAvg),
      readMsAvg: texto(fila.readMsAvg),
      computeMsAvg: texto(fila.computeMsAvg),
      writeMsAvg: texto(fila.writeMsAvg),
      pasos,
    };
  });
}

function texto(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function normalizarTimestampBigQuery(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = String(valor);
  if (!/^\d+$/.test(texto)) return texto;
  const fecha = new Date(Number(texto));
  return Number.isNaN(fecha.getTime()) ? texto : fecha.toISOString();
}

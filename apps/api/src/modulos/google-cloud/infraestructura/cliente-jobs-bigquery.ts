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
      creationTime: String(stats.creationTime ?? ""),
      startTime: stats.startTime ? String(stats.startTime) : null,
      endTime: stats.endTime ? String(stats.endTime) : null,
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
      parentJobId: ref.parentJobId ? String(ref.parentJobId) : null,
    };
  }
}

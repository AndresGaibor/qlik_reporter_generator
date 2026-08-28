import type {
  MetadatoJobBigQuery,
  PuertoJobsBigQuery,
} from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type {
  EjecucionReportePersistida,
  JobBigQueryPersistido,
  PuertoRepositorioReportes,
} from "./puertos/puerto-repositorio-reportes.js";

export class SincronizarJobsBigQueryEjecucion {
  constructor(
    private readonly repoReportes: PuertoRepositorioReportes,
    private readonly jobsBigQuery: PuertoJobsBigQuery,
  ) {}

  async sincronizar(ejecucionId: string): Promise<void> {
    const ejecucion =
      await this.repoReportes.obtenerEjecucionPorId(ejecucionId);
    if (!ejecucion) {
      return;
    }

    const jobId = ejecucion.jobIdPrincipalBigQuery;
    if (!jobId) {
      return;
    }

    const projectId = ejecucion.bigqueryProjectId;
    if (!projectId) {
      return;
    }

    const mainJob = await this.jobsBigQuery.obtenerJob({
      projectId,
      jobId,
      location: ejecucion.bigqueryLocation ?? undefined,
    });

    if (!mainJob) {
      return;
    }

    await this.persistirJob(mainJob, ejecucion);

    if (
      mainJob.errorResult &&
      !(
        ejecucion.estado === "cancelando" &&
        esCancelacionBigQuery(mainJob.errorResult)
      )
    ) {
      await this.repoReportes.marcarEjecucionError(
        ejecucion.id,
        "bigquery",
        mensajeErrorBigQuery(mainJob.errorResult),
        mainJob.endTime ? new Date(mainJob.endTime) : new Date(),
      );
    }

    const hijos = await this.jobsBigQuery.listarHijos({
      projectId,
      parentJobId: jobId,
      location: ejecucion.bigqueryLocation ?? undefined,
    });

    for (const hijo of hijos) {
      await this.persistirJob(hijo, ejecucion, jobId);
    }

    if (mainJob.startTime || mainJob.endTime) {
      const timestamps: {
        bigqueryIniciadoEn?: Date | null;
        bigqueryFinalizadoEn?: Date | null;
      } = {};
      if (mainJob.startTime) {
        timestamps.bigqueryIniciadoEn = new Date(mainJob.startTime);
      }
      if (mainJob.endTime) {
        timestamps.bigqueryFinalizadoEn = new Date(mainJob.endTime);
      }
      await this.repoReportes.actualizarTimestampsEjecucionBigQuery(
        ejecucionId,
        timestamps,
      );
    }
  }

  private async persistirJob(
    metadata: MetadatoJobBigQuery,
    ejecucion: EjecucionReportePersistida,
    parentJobId?: string,
  ): Promise<void> {
    const jobPersistido = mapearMetadatoToPersistido(
      metadata,
      ejecucion,
      parentJobId,
    );
    await this.repoReportes.guardarJobBigQueryEjecucion(jobPersistido);
  }
}

function mapearMetadatoToPersistido(
  metadata: MetadatoJobBigQuery,
  ejecucion: EjecucionReportePersistida,
  parentJobId?: string,
): JobBigQueryPersistido {
  const estado = mapearEstado(metadata.estado, metadata.errorResult);
  const duracionMs = calcularDuracionMs(metadata.startTime, metadata.endTime);

  return {
    ejecucionReporteId: ejecucion.id,
    jobId: metadata.jobId,
    parentJobId: parentJobId ?? metadata.parentJobId,
    projectId: metadata.projectId,
    location: metadata.location || ejecucion.bigqueryLocation || "US",
    tipo: parentJobId ? "child" : "principal",
    estado,
    creationTime: metadata.creationTime || null,
    startTime: metadata.startTime || null,
    endTime: metadata.endTime || null,
    duracionMs,
    totalBytesProcessed: metadata.totalBytesProcessed,
    totalBytesBilled: metadata.totalBytesBilled,
    totalSlotMs: metadata.totalSlotMs,
    cacheHit: metadata.cacheHit,
    statementType: metadata.statementType,
    errorReason: metadata.errorResult?.reason ?? null,
    errorMessage: metadata.errorResult?.message ?? null,
    metadataJson: {
      timeline: metadata.timeline,
      queryPlan: metadata.queryPlan,
      observadoEn: new Date().toISOString(),
    },
  };
}

function mapearEstado(
  estadoBQ: MetadatoJobBigQuery["estado"],
  errorResult: MetadatoJobBigQuery["errorResult"],
): JobBigQueryPersistido["estado"] {
  if (estadoBQ === "ERROR" || errorResult) {
    return "error";
  }
  switch (estadoBQ) {
    case "RUNNING":
      return "running";
    case "DONE":
      return "done";
    case "PENDING":
      return "pendiente";
    default: {
      const _exhaustive: never = estadoBQ;
      return "pendiente";
    }
  }
}

function esCancelacionBigQuery(error: { reason: string }): boolean {
  return error.reason === "stopped" || error.reason === "cancelled";
}

function mensajeErrorBigQuery(error: {
  reason: string;
  message: string;
}): string {
  if (error.reason === "stopped" || error.reason === "cancelled") {
    return "El job de BigQuery fue cancelado.";
  }
  return (
    error.message || `El job de BigQuery terminó con error: ${error.reason}`
  );
}

function calcularDuracionMs(
  startTime: string | null,
  endTime: string | null,
): number | null {
  if (!startTime || !endTime) {
    return null;
  }
  const inicio = new Date(startTime).getTime();
  const fin = new Date(endTime).getTime();
  return fin - inicio;
}

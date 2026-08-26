export type EstadoJobBigQuery = "PENDING" | "RUNNING" | "DONE" | "ERROR";

export interface MetadatoJobBigQuery {
  jobId: string;
  projectId: string;
  location: string;
  estado: EstadoJobBigQuery;
  creationTime: string;
  startTime: string | null;
  endTime: string | null;
  totalBytesProcessed: string | null;
  totalBytesBilled: string | null;
  totalSlotMs: string | null;
  cacheHit: boolean | null;
  statementType: string | null;
  errorResult: { reason: string; message: string } | null;
  parentJobId: string | null;
}

export interface PuertoJobsBigQuery {
  obtenerJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery | null>;

  listarHijos(input: {
    projectId: string;
    parentJobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery[]>;
}

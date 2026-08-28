export type EstadoJobBigQuery = "PENDING" | "RUNNING" | "DONE" | "ERROR";

export interface MuestraTimelineBigQuery {
  elapsedMs: string | null;
  totalSlotMs: string | null;
  pendingUnits: string | null;
  completedUnits: string | null;
  activeUnits: string | null;
  estimatedRunnableUnits: string | null;
}

export interface EtapaPlanBigQuery {
  id: string;
  name: string | null;
  status: string | null;
  recordsRead: string | null;
  recordsWritten: string | null;
  slotMs: string | null;
  waitMsAvg: string | null;
  readMsAvg: string | null;
  computeMsAvg: string | null;
  writeMsAvg: string | null;
  pasos: string[];
}

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
  timeline: MuestraTimelineBigQuery[];
  queryPlan: EtapaPlanBigQuery[];
  parentJobId: string | null;
}

export interface PuertoJobsBigQuery {
  obtenerJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery | null>;

  cancelarJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<void>;

  listarHijos(input: {
    projectId: string;
    parentJobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery[]>;
}

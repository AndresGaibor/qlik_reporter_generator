import type { MetadatoJobBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";

export interface ProgresoEjecucionAmigable {
  fase:
    | "preparando"
    | "leyendo"
    | "procesando"
    | "generando_archivos"
    | "finalizando"
    | "cancelando";
  mensaje: string;
  sigueTrabajando: boolean;
  tardaMasDeLoHabitual: boolean;
  altaDemanda: boolean;
  volumenInusual: boolean;
  actualizadoEn: string | null;
}

export function analizarProgresoBigQuery(input: {
  estadoEjecucion: string;
  job: MetadatoJobBigQuery | null;
  iniciadoEn: Date | null;
  ahora?: Date;
}): ProgresoEjecucionAmigable | null {
  const ahora = input.ahora ?? new Date();
  if (input.estadoEjecucion === "cancelando") {
    return progreso(
      "cancelando",
      "Cancelando…",
      false,
      false,
      false,
      false,
      null,
    );
  }
  if (!input.job && input.estadoEjecucion === "preparando") {
    return progreso(
      "preparando",
      "Preparando el reporte",
      true,
      false,
      false,
      false,
      null,
    );
  }
  if (!input.job) return null;

  const timeline = input.job.timeline;
  const ultima = timeline.at(-1);
  const altaDemanda = toNumber(ultima?.estimatedRunnableUnits) > 0;
  const volumenInusual = input.job.queryPlan.some((stage) => {
    const read = toNumber(stage.recordsRead);
    const written = toNumber(stage.recordsWritten);
    return read >= 1000 && written / read >= 10;
  });
  const activo = input.job.estado === "RUNNING";
  const iniciadoEn = input.iniciadoEn;
  const tarda =
    activo &&
    iniciadoEn !== null &&
    ahora.getTime() - iniciadoEn.getTime() >= 600_000;
  const sigue = activo ? avanza(timeline) : false;
  const fase = faseJob(input.job);
  const mensaje =
    fase === "generando_archivos"
      ? "Generando los archivos"
      : fase === "leyendo"
        ? "Leyendo la información necesaria"
        : fase === "finalizando"
          ? "Finalizando"
          : fase === "procesando"
            ? "Procesando la información"
            : "Preparando el reporte";
  return progreso(
    fase,
    mensaje,
    activo ||
      input.estadoEjecucion === "preparando" ||
      input.estadoEjecucion === "iniciada",
    tarda,
    altaDemanda,
    volumenInusual,
    input.job.endTime ?? null,
    sigue,
  );
}

function progreso(
  fase: ProgresoEjecucionAmigable["fase"],
  mensaje: string,
  sigueTrabajando: boolean,
  tardaMasDeLoHabitual: boolean,
  altaDemanda: boolean,
  volumenInusual: boolean,
  actualizadoEn: string | null,
  sigue = sigueTrabajando,
): ProgresoEjecucionAmigable {
  return {
    fase,
    mensaje,
    sigueTrabajando: sigue,
    tardaMasDeLoHabitual,
    altaDemanda,
    volumenInusual,
    actualizadoEn,
  };
}

function faseJob(job: MetadatoJobBigQuery): ProgresoEjecucionAmigable["fase"] {
  if (job.estado === "DONE") return "finalizando";
  const activos = job.queryPlan.filter(
    (stage) => !stage.status || /running|active/i.test(stage.status),
  );
  if (
    activos.some((stage) =>
      stage.pasos.some((paso) => paso.toUpperCase() === "WRITE"),
    )
  )
    return "generando_archivos";
  if (
    activos.some((stage) =>
      stage.pasos.some((paso) => paso.toUpperCase() === "READ"),
    ) &&
    !activos.some((stage) =>
      stage.pasos.some((paso) => /JOIN|AGGREGATE/i.test(paso)),
    )
  )
    return "leyendo";
  return "procesando";
}

function avanza(timeline: MetadatoJobBigQuery["timeline"]): boolean {
  if (timeline.length < 2) return true;
  const actual = timeline.at(-1);
  const anterior = timeline.at(-2);
  if (!actual || !anterior) return true;
  const elapsed = toNumber(actual.elapsedMs) - toNumber(anterior.elapsedMs);
  if (elapsed < 30_000) return true;
  return (
    toNumber(actual.completedUnits) > toNumber(anterior.completedUnits) ||
    toNumber(actual.totalSlotMs) > toNumber(anterior.totalSlotMs)
  );
}

function toNumber(value: string | null | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

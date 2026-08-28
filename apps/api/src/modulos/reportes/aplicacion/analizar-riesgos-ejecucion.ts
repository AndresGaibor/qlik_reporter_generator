import type { RiesgoEjecucionReporte } from "@qlik/contratos";
import type { PlanDataflow } from "../dominio/plan-dataflow.js";

export function analizarRiesgosEjecucion(
  plan: PlanDataflow,
): RiesgoEjecucionReporte[] {
  const riesgo = plan.pasos.some((paso) => {
    if (
      paso.tipo !== "join" ||
      paso.join !== "full" ||
      paso.claves.length !== 1
    )
      return false;
    const clave = paso.claves[0].toLowerCase();
    return /fecha|mes|año|ano|year|month|date/.test(clave);
  });
  return riesgo
    ? [
        {
          codigo: "JOIN_ALTO_VOLUMEN",
          severidad: "alta",
          titulo: "Este reporte puede tardar bastante",
          mensaje:
            "La configuración del reporte puede generar una cantidad muy grande de información. Esto puede aumentar el tiempo de procesamiento y el uso de recursos.",
        },
      ]
    : [];
}

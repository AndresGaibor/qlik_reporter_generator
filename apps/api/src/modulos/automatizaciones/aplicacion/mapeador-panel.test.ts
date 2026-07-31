import { describe, expect, it } from "bun:test";
import { aResumenAutomatizacion } from "./mapeador-panel.js";

describe("mapeador del resumen de automatizaciones", () => {
  it("expone el estado y las fechas de la última ejecución", () => {
    const resumen = aResumenAutomatizacion(
      {
        id: "automation-1",
        name: "Reporte de clientes",
        state: "available",
        lastRun: {
          id: "run-1",
          status: "finished",
          startTime: "2026-07-30T20:00:00.000Z",
          stopTime: "2026-07-30T20:01:30.000Z",
        },
      },
      new Map(),
      new Map(),
    );

    expect(resumen.ultimaEjecucionEstado).toBe("finished");
    expect(resumen.ultimaEjecucionInicio).toBe("2026-07-30T20:00:00.000Z");
    expect(resumen.ultimaEjecucionFin).toBe("2026-07-30T20:01:30.000Z");
  });
});

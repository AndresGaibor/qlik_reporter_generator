import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { SincronizarEjecucionesReporte } from "./sincronizar-ejecuciones-reporte.js";

describe("SincronizarEjecucionesReporte", () => {
  it.each([
    ["finished", "completada"],
    ["finished with warnings", "completada"],
    ["failed", "error"],
    ["exceeded limit", "error"],
    ["stopped", "detenida"],
  ] as const)("mapea Qlik %s a %s", async (estadoQlik, estadoLocal) => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({
        id: "config-1",
        automatizacionIdQlik: "auto-1",
      })),
      listarEjecuciones: vi.fn(async () => [
        { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
      ]),
      marcarEstadoPorRunQlik: marcar,
    };
    const qlik = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "run-1",
          status: estadoQlik,
          stopTime: "2026-08-14T23:05:00.000Z",
        },
      ]),
    } as unknown as ServicioQlik;

    await new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
      "tenant-1",
      "auto-1",
    );

    expect(marcar).toHaveBeenCalledWith(
      "run-1",
      estadoLocal,
      new Date("2026-08-14T23:05:00.000Z"),
    );
  });

  it("no modifica auditorías si Qlik sigue running", async () => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      obtenerPorAutomatizacion: async () => ({ id: "config-1" }),
      listarEjecuciones: async () => [
        { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
      ],
      marcarEstadoPorRunQlik: marcar,
    };
    const qlik = {
      listarEjecuciones: async () => [{ id: "run-1", status: "running" }],
    } as unknown as ServicioQlik;

    await new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
      "tenant-1",
      "auto-1",
    );

    expect(marcar).not.toHaveBeenCalled();
  });
});

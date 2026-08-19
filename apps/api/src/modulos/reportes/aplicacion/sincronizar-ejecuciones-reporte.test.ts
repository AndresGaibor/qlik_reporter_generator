import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { SincronizarEjecucionesReporte } from "./sincronizar-ejecuciones-reporte.js";

function llamada(repo: Record<string, unknown>, qlik: ServicioQlik) {
  return new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
    "reporte-1",
    "tenant-1",
    "organizacion-1",
  );
}

describe("SincronizarEjecucionesReporte", () => {
  it("usa el automate histórico almacenado para cada ejecución", async () => {
    const repo = {
      obtenerPorId: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-old",
          runIdQlik: "run-old",
          automatizacionIdQlik: "auto-old",
          estado: "iniciada",
        },
        {
          id: "e-new",
          runIdQlik: "run-new",
          automatizacionIdQlik: "auto-new",
          estado: "iniciada",
        },
      ]),
      marcarEstadoPorRunQlik: vi.fn(async () => undefined),
    };
    const listarEjecuciones = vi.fn(async (id: string) => [
      {
        id: id === "auto-old" ? "run-old" : "run-new",
        status: "stopped",
      },
    ]);

    await llamada(repo, { listarEjecuciones } as unknown as ServicioQlik);

    expect(listarEjecuciones).toHaveBeenNthCalledWith(1, "auto-old", {
      limit: 100,
      sort: "desc",
    });
    expect(listarEjecuciones).toHaveBeenNthCalledWith(2, "auto-new", {
      limit: 100,
      sort: "desc",
    });
  });

  it("no marca completada solo porque Qlik responde finished", async () => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      obtenerPorId: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "iniciada",
        },
      ]),
      marcarEstadoPorRunQlik: marcar,
    };
    await llamada(repo, {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "finished" },
      ]),
    } as unknown as ServicioQlik);
    expect(marcar).not.toHaveBeenCalled();
  });

  it("mapea stopped a detenida", async () => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      obtenerPorId: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "iniciada",
        },
      ]),
      marcarEstadoPorRunQlik: marcar,
    };
    await llamada(repo, {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "stopped" },
      ]),
    } as unknown as ServicioQlik);
    expect(marcar).toHaveBeenCalledWith("run-1", "detenida", expect.any(Date));
  });
});

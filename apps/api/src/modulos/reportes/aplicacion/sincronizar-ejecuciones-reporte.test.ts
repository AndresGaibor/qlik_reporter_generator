import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { SincronizarEjecucionesReporte } from "./sincronizar-ejecuciones-reporte.js";

function llamada(repo: Record<string, unknown>, qlik: ServicioQlik) {
  return new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
    "flujo-1",
    "tenant-1",
    "organizacion-1",
  );
}

describe("SincronizarEjecucionesReporte", () => {
  it("usa el automate histórico almacenado para cada ejecución", async () => {
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-old",
          runIdQlik: "run-shared",
          automatizacionIdQlik: "auto-old",
          estado: "iniciada",
        },
        {
          id: "e-new",
          runIdQlik: "run-shared",
          automatizacionIdQlik: "auto-new",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: vi.fn(async () => undefined),
    };
    const listarEjecuciones = vi.fn(async (id: string) => [
      {
        id: "run-shared",
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

  it("actualiza solo la ejecución asociada y obtiene el detalle con su automate histórico", async () => {
    const marcarEstado = vi.fn(async () => undefined);
    const marcarError = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-old",
          runIdQlik: "run-shared",
          automatizacionIdQlik: "auto-old",
          estado: "iniciada",
        },
        {
          id: "e-new",
          runIdQlik: "run-shared",
          automatizacionIdQlik: "auto-new",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: marcarEstado,
      marcarEjecucionError: marcarError,
    };
    const listar = vi.fn(async (automatizacionIdQlik: string) =>
      automatizacionIdQlik === "auto-old"
        ? [{ id: "run-shared", status: "failed", error: { message: "viejo" } }]
        : [{ id: "run-shared", status: "stopped" }],
    );
    const solicitarJson = vi.fn(async ({ ruta }: { ruta: string }) => ({
      id: "run-shared",
      status: "failed",
      error: { message: `detalle-${ruta}` },
    }));

    await llamada(repo, { listarEjecuciones: listar, solicitarJson } as never);

    expect(marcarError).toHaveBeenCalledWith(
      "e-old",
      "ejecucion-qlik",
      expect.stringContaining("detalle-/api/workflows/automations/auto-old"),
      expect.any(Date),
    );
    expect(marcarEstado).toHaveBeenCalledWith(
      "e-new",
      "detenida",
      expect.any(Date),
    );
    expect(marcarError).not.toHaveBeenCalledWith(
      "e-new",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(solicitarJson).toHaveBeenCalledWith({
      metodo: "GET",
      ruta: "/api/workflows/automations/auto-old/runs/run-shared",
    });
  });

  it("no marca completada solo porque Qlik responde finished", async () => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: marcar,
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
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: marcar,
    };
    await llamada(repo, {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "stopped" },
      ]),
    } as unknown as ServicioQlik);
    expect(marcar).toHaveBeenCalledWith("e-1", "detenida", expect.any(Date));
  });
});

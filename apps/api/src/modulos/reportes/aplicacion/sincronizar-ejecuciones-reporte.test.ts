import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { ErrorApiQlik } from "../../qlik/infraestructura/error-api-qlik.js";
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

  it("marca detenidas las ejecuciones cuyo automate fue eliminado y continúa con los demás", async () => {
    const marcarEstado = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-borrada",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-borrada",
          estado: "iniciada",
        },
        {
          id: "e-viva",
          runIdQlik: "run-2",
          automatizacionIdQlik: "auto-viva",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: marcarEstado,
    };
    const listar = vi.fn(async (automatizacionIdQlik: string) => {
      if (automatizacionIdQlik === "auto-borrada") {
        throw new ErrorApiQlik(
          404,
          "Not Found",
          "/api/workflows/automations/auto-borrada/runs",
        );
      }
      return [{ id: "run-2", status: "stopped" }];
    });

    await llamada(repo, {
      listarEjecuciones: listar,
    } as unknown as ServicioQlik);

    expect(marcarEstado).toHaveBeenCalledWith(
      "e-borrada",
      "detenida",
      expect.any(Date),
    );
    expect(marcarEstado).toHaveBeenCalledWith(
      "e-viva",
      "detenida",
      expect.any(Date),
    );
  });

  it("propaga errores de Qlik distintos de 404", async () => {
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "iniciada",
        },
      ]),
      marcarEstadoEjecucion: vi.fn(async () => undefined),
    };
    const error = new ErrorApiQlik(
      403,
      "Forbidden",
      "/api/workflows/automations/auto-1/runs",
    );

    await expect(
      llamada(repo, {
        listarEjecuciones: vi.fn(async () => {
          throw error;
        }),
      } as unknown as ServicioQlik),
    ).rejects.toBe(error);
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
      obtenerAutomatizacion: vi.fn(async () => ({ workspace: { blocks: [] } })),
    } as unknown as ServicioQlik);
    expect(marcar).not.toHaveBeenCalled();
  });

  it("reporta el fin Talend sin completar antes de confirmar BigQuery", async () => {
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

    const finalizadas = await llamada(repo, {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "finished", stopTime: "2026-08-26T17:05:15Z" },
      ]),
      obtenerAutomatizacion: vi.fn(async () => ({
        workspace: {
          blocks: [{ snippet_guid: "087a1ce0-037c-11ee-9163-4dcbc6412d48" }],
        },
      })),
    } as unknown as ServicioQlik);

    expect(finalizadas.get("e-1")).toEqual(new Date("2026-08-26T17:05:15Z"));
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

  it("mantiene cancelando si Qlik está detenido pero BigQuery sigue RUNNING", async () => {
    const detenida = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "cancelando",
        },
      ]),
      obtenerEjecucionPorId: vi.fn(async () => ({
        id: "e-1",
        estado: "cancelando",
        jobIdPrincipalBigQuery: "job-1",
        bigqueryProjectId: "p",
      })),
      marcarEjecucionDetenida: detenida,
    };
    const jobs = {
      obtenerJob: vi.fn(async () => ({ estado: "RUNNING", errorResult: null })),
    };
    await new SincronizarEjecucionesReporte(
      {
        listarEjecuciones: vi.fn(async () => [
          { id: "run-1", status: "stopped" },
        ]),
      } as never,
      repo as never,
      jobs as never,
    ).ejecutar("flujo-1", "tenant-1", "organizacion-1");
    expect(detenida).not.toHaveBeenCalled();
  });

  it("mantiene cancelando si Qlik sigue running aunque BigQuery esté cancelado", async () => {
    const detenida = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "cancelando",
        },
      ]),
      obtenerEjecucionPorId: vi.fn(async () => ({
        id: "e-1",
        estado: "cancelando",
        jobIdPrincipalBigQuery: "job-1",
        bigqueryProjectId: "p",
      })),
      marcarEjecucionDetenida: detenida,
    };
    const jobs = {
      obtenerJob: vi.fn(async () => ({
        estado: "DONE",
        errorResult: { reason: "cancelled", message: "cancelled" },
      })),
    };
    await new SincronizarEjecucionesReporte(
      {
        listarEjecuciones: vi.fn(async () => [
          { id: "run-1", status: "running" },
        ]),
      } as never,
      repo as never,
      jobs as never,
    ).ejecutar("flujo-1", "tenant-1", "organizacion-1");
    expect(detenida).not.toHaveBeenCalled();
  });

  it("marca detenida solo cuando Qlik stopped y BigQuery confirma cancelación", async () => {
    const detenida = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "cancelando",
        },
      ]),
      obtenerEjecucionPorId: vi.fn(async () => ({
        id: "e-1",
        estado: "cancelando",
        jobIdPrincipalBigQuery: "job-1",
        bigqueryProjectId: "p",
      })),
      marcarEjecucionDetenida: detenida,
    };
    const jobs = {
      obtenerJob: vi.fn(async () => ({
        estado: "DONE",
        errorResult: { reason: "stopped", message: "cancelled" },
      })),
    };
    await new SincronizarEjecucionesReporte(
      {
        listarEjecuciones: vi.fn(async () => [
          { id: "run-1", status: "stopped" },
        ]),
      } as never,
      repo as never,
      jobs as never,
    ).ejecutar("flujo-1", "tenant-1", "organizacion-1");
    expect(detenida).toHaveBeenCalledWith("e-1", expect.any(Date));
  });

  it("cierra prudentemente como detenida si nunca hubo job BigQuery", async () => {
    const detenida = vi.fn(async () => undefined);
    const repo = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "e-1",
          runIdQlik: "run-1",
          automatizacionIdQlik: "auto-1",
          estado: "cancelando",
        },
      ]),
      obtenerEjecucionPorId: vi.fn(async () => ({
        id: "e-1",
        estado: "cancelando",
        jobIdPrincipalBigQuery: null,
      })),
      marcarEjecucionDetenida: detenida,
    };
    await new SincronizarEjecucionesReporte(
      {
        listarEjecuciones: vi.fn(async () => [
          { id: "run-1", status: "stopped" },
        ]),
      } as never,
      repo as never,
    ).ejecutar("flujo-1", "tenant-1", "organizacion-1");
    expect(detenida).toHaveBeenCalledWith("e-1", expect.any(Date));
  });
});

import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { SincronizarEjecucionesReporte } from "./sincronizar-ejecuciones-reporte.js";

describe("SincronizarEjecucionesReporte", () => {
  it("mapea Qlik stopped a detenida", async () => {
    const marcar = vi.fn(async () => undefined);
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
      ]),
      marcarEstadoPorRunQlik: marcar,
    };
    const qlik = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "run-1",
          status: "stopped",
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
      "detenida",
      new Date("2026-08-14T23:05:00.000Z"),
    );
  });

  it.each(["finished", "finished with warnings"])(
    "no marca completada solo porque Qlik terminó con %s",
    async (status) => {
      const marcar = vi.fn(async () => undefined);
      const repo = {
        obtenerPorAutomatizacion: vi.fn(async () => ({ id: "config-1" })),
        listarEjecuciones: vi.fn(async () => [
          { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
        ]),
        marcarEstadoPorRunQlik: marcar,
      };
      const qlik = {
        listarEjecuciones: vi.fn(async () => [{ id: "run-1", status }]),
      } as unknown as ServicioQlik;

      await new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
        "tenant-1",
        "auto-1",
      );

      expect(marcar).not.toHaveBeenCalled();
    },
  );

  it("persiste el mensaje real de Talend cuando Qlik termina failed", async () => {
    const marcarError = vi.fn(async () => undefined);
    const marcarEstado = vi.fn(async () => undefined);
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
      ]),
      marcarEjecucionError: marcarError,
      marcarEstadoPorRunQlik: marcarEstado,
    };
    const qlik = {
      listarEjecuciones: vi.fn(async () => [
        {
          id: "run-1",
          status: "failed",
          stopTime: "2026-08-17T19:14:19.000Z",
        },
      ]),
      solicitarJson: vi.fn(async () => ({
        id: "run-1",
        status: "failed",
        error: [
          {
            endpoint: { datasource: "Talend Cloud", name: "Execute Task" },
            error: 'Error calling endpoint "Talend Cloud - Execute Task"',
            response: {
              status: 400,
              body: {
                message: "Talend rechazó los parámetros de contexto del Task",
              },
            },
          },
        ],
      })),
    } as unknown as ServicioQlik;

    await new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
      "tenant-1",
      "auto-1",
    );

    expect(marcarError).toHaveBeenCalledWith(
      "e-1",
      "talend",
      "Talend rechazó los parámetros de contexto del Task",
      new Date("2026-08-17T19:14:19.000Z"),
    );
    expect(marcarEstado).not.toHaveBeenCalled();
  });

  it("guarda un error útil si Qlik falla sin detalle estructurado", async () => {
    const marcarError = vi.fn(async () => undefined);
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({ id: "config-1" })),
      listarEjecuciones: vi.fn(async () => [
        { id: "e-1", runIdQlik: "run-1", estado: "iniciada" },
      ]),
      marcarEjecucionError: marcarError,
      marcarEstadoPorRunQlik: vi.fn(async () => undefined),
    };
    const qlik = {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "exceeded limit" },
      ]),
      solicitarJson: vi.fn(async () => {
        throw new Error("detalle no disponible");
      }),
    } as unknown as ServicioQlik;

    await new SincronizarEjecucionesReporte(qlik, repo as never).ejecutar(
      "tenant-1",
      "auto-1",
    );

    expect(marcarError).toHaveBeenCalledWith(
      "e-1",
      "ejecucion-qlik",
      "La ejecución Qlik finalizó con estado exceeded limit",
      expect.any(Date),
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

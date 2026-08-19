import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import { crearRutasReportesDataflow } from "./rutas-reportes-dataflow.js";

const sesion = {
  tenantId: "tenant-1",
  organizacionId: "org-1",
  usuarioId: "user-1",
  usuarioIdQlik: "qlik-1",
};

function appCon(qlik: Record<string, unknown>, extras = {}) {
  return new Hono().route(
    "/api/reportes",
    crearRutasReportesDataflow({
      resolverQlik: async () => qlik as never,
      resolverConsultaFlujos: async () => ({
        listar: async (espacioId?: string) =>
          (
            await (
              qlik.listarFlujos as (
                id?: string,
              ) => Promise<
                Array<{ id: string; name: string; spaceId?: string }>
              >
            )(espacioId)
          ).map((f) => ({
            id: f.id,
            nombre: f.name,
            espacioId: f.spaceId,
            espacioNombre: f.spaceId ?? "Espacio personal",
          })),
      }),
      resolverBigQuery: async () => ({
        estimador: {
          estimarConsulta: vi.fn(async () => ({
            bytesProcesados: 1,
            costoEstimadoUsd: 0,
          })),
        },
        projectId: "p",
        dataset: "d",
      }),
      resolverSesion: async () => sesion,
      repositorioReportes: {
        listarEjecuciones: vi.fn(async () => []),
      } as never,
      ...extras,
    }),
  );
}

describe("fachada /api/reportes para Dataflows", () => {
  it("lista Dataflows Qlik y aplica búsqueda y espacio, sin leer reportes locales", async () => {
    const listarFlujos = vi.fn(async () => [
      { id: "df-1", name: "Ventas", spaceId: "sp-1" },
      { id: "df-2", name: "Compras", spaceId: "sp-2" },
    ]);
    const app = appCon(
      { listarFlujos, listarEspacios: vi.fn(async () => []) },
      { repositorioReportes: { listar: vi.fn() } as never },
    );

    const respuesta = await app.request(
      "/api/reportes?q=ventas&espacioId=sp-1",
    );

    expect(respuesta.status).toBe(200);
    expect(listarFlujos).toHaveBeenCalledWith("sp-1");
    expect((await respuesta.json()).datos).toEqual([
      expect.objectContaining({ id: "df-1", nombre: "Ventas" }),
    ]);
  });

  it("expone detalle, resumen y preflight del Dataflow actual", async () => {
    const qlik = {
      listarFlujos: vi.fn(async () => [
        { id: "df-1", name: "Ventas", spaceId: "sp-1" },
      ]),
      obtenerScriptApp: vi.fn(async () => ({
        script: "LOAD id; SQL SELECT id FROM `p.d.t`;",
      })),
      validarScriptApp: vi.fn(async () => ({ errores: [], advertencias: [] })),
    };
    const app = appCon(qlik);
    expect(
      (await (await app.request("/api/reportes/df-1")).json()).datos,
    ).toMatchObject({ id: "df-1", nombre: "Ventas" });
    expect(
      (await (await app.request("/api/reportes/df-1/resumen")).json()).datos
        .flujoId,
    ).toBe("df-1");
    expect(
      (await (await app.request("/api/reportes/df-1/preflight")).json()).datos
        .flujoIdQlik,
    ).toBe("df-1");
  });

  it("rechaza un Dataflow que no está disponible en el tenant", async () => {
    const app = appCon({ listarFlujos: vi.fn(async () => []) });
    const respuesta = await app.request("/api/reportes/df-1");
    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error.codigo).toBe(
      "DATAFLOW_NO_ENCONTRADO",
    );
  });

  it("lista historial y ejecuta usando flujoIdQlik, no reporteId", async () => {
    const ejecutar = vi.fn(async () => ({
      runId: "run-1",
      ejecucionReporteId: "exec-1",
    }));
    const listarEjecuciones = vi.fn(async () => []);
    const app = appCon(
      { listarFlujos: vi.fn(async () => [{ id: "df-1", name: "Ventas" }]) },
      {
        repositorioReportes: { listarEjecuciones },
        resolverEjecutarReporte: async () => ejecutar,
      },
    );
    expect((await app.request("/api/reportes/df-1/ejecuciones")).status).toBe(
      200,
    );
    const respuesta = await app.request("/api/reportes/df-1/ejecuciones", {
      method: "POST",
    });
    expect(respuesta.status).toBe(200);
    expect(listarEjecuciones).toHaveBeenCalledWith(
      "df-1",
      "tenant-1",
      "org-1",
      100,
    );
    expect(ejecutar).toHaveBeenCalledWith({ flujoIdQlik: "df-1", ...sesion });
  });
});

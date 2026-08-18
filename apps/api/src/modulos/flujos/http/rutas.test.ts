import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import { crearRutasFlujos } from "./rutas.js";

describe("rutas de flujos", () => {
  it("expone el Dataflow base para abrirlo en Qlik", async () => {
    const app = new Hono().route(
      "/api/flujos",
      crearRutasFlujos(
        async () => ({ listar: async () => [] }),
        async () =>
          ({
            listarFlujos: async () => [],
          }) as never,
        {
          resolverSesion: async () => ({ tenantId: "tenant-1" }),
          obtenerTenant: async () => ({
            dataflowBaseIdQlik: "base-1",
            dataflowBaseNombre: "Base Ventas",
          }),
        },
      ),
    );

    const respuesta = await app.request("/api/flujos/plantilla-base");
    const cuerpo = (await respuesta.json()) as { datos: unknown };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos).toEqual({
      id: "base-1",
      nombre: "Base Ventas",
    });
  });

  it("localiza por resourceId y copia usando el App ID del Dataflow", async () => {
    const copiarDataflow = vi.fn(async () => ({
      id: "copia-1",
      nombre: "Copia ventas",
    }));
    const app = new Hono().route(
      "/api/flujos",
      crearRutasFlujos(
        async () => ({ listar: async () => [] }),
        async () =>
          ({
            listarFlujos: async () => [
              {
                id: "item-1",
                appId: "app-real-1",
                name: "Base Ventas",
                spaceId: "space-1",
                description: "qlik generator",
              },
            ],
            copiarDataflow,
          }) as never,
        {
          resolverSesion: async () => ({ tenantId: "tenant-1" }),
          obtenerTenant: async () => ({ dataflowBaseIdQlik: "item-1" }),
        },
      ),
    );

    const respuesta = await app.request("/api/flujos/desde-plantilla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Copia ventas" }),
    });

    expect(respuesta.status).toBe(201);
    expect(copiarDataflow).toHaveBeenCalledWith(
      "app-real-1",
      "Copia ventas",
      { espacioId: "space-1", descripcion: "qlik generator" },
    );
  });

  it("expone un resumen seguro validado por Qlik", async () => {
    const validarScriptApp = vi.fn(async () => ({
      errores: [],
      advertencias: [],
    }));
    const app = new Hono().route(
      "/api/flujos",
      crearRutasFlujos(
        async () => ({ listar: async () => [] }),
        async () =>
          ({
            listarFlujos: async () => [
              { id: "flujo-1", name: "Ventas diarias" },
            ],
            obtenerScriptApp: async () => ({
              script:
                "LIB CONNECT TO [Google BigQuery:Prod]; [salida]: LOAD [Fecha], [Total]; SQL SELECT Fecha, Total FROM `p.d.ventas` WHERE Fecha >= '2026-08-01';",
            }),
            validarScriptApp,
          }) as never,
      ),
    );

    const respuesta = await app.request("/api/flujos/flujo-1/resumen");
    const cuerpo = (await respuesta.json()) as {
      datos: Record<string, unknown>;
    };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos).toMatchObject({
      nombre: "Ventas diarias",
      estado: "analizado",
    });
    expect(cuerpo.datos).not.toHaveProperty("script");
    expect(cuerpo.datos).not.toHaveProperty("sqlBigQuery");
    expect(validarScriptApp).toHaveBeenCalledTimes(1);
  });

  it("devuelve el estado script no disponible sin exponer el error técnico", async () => {
    const app = new Hono().route(
      "/api/flujos",
      crearRutasFlujos(
        async () => ({ listar: async () => [] }),
        async () =>
          ({
            listarFlujos: async () => [],
            obtenerScriptApp: async () => {
              throw new Error("Script no disponible");
            },
          }) as never,
      ),
    );

    const respuesta = await app.request("/api/flujos/flujo-2/resumen");
    const cuerpo = (await respuesta.json()) as {
      datos: { estado: string; advertencias: string[] };
    };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos.estado).toBe("script_no_disponible");
    expect(cuerpo.datos.advertencias).toContain("Script no disponible");
  });
});

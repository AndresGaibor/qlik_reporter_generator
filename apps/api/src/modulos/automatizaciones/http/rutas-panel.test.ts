import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { crearRutasPanelAutomatizaciones } from "./rutas-panel.js";

describe("superficie técnica de automatizaciones", () => {
  it("no crea recursos de reportes desde el panel técnico", async () => {
    const resolverQlik = vi.fn(async () => ({}) as ServicioQlik);
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "user-1",
        organizacionId: "org-1",
        usuarioIdQlik: "qlik-1",
      }),
      consultaTenant: {} as never,
    });

    const respuesta = await rutas.request("/desde-plantilla", {
      method: "POST",
    });

    expect(respuesta.status).toBe(404);
    expect(resolverQlik).not.toHaveBeenCalled();
  });
});

describe("POST /:id/ejecuciones", () => {
  it("no acepta un ID de Qlik Automate como ejecución de reporte local", async () => {
    const resolverQlik = vi.fn(async () => ({}) as ServicioQlik);
    const resolverSesion = vi.fn(async () => ({
      tenantId: "tenant-1",
      usuarioId: "usuario-1",
      organizacionId: "organizacion-1",
      usuarioIdQlik: "andres-qlik-id",
    }));
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik,
      resolverSesion,
      consultaTenant: {} as never,
    });

    const respuesta = await rutas.request("/auto-1/ejecuciones", {
      method: "POST",
    });
    expect(respuesta.status).toBe(404);
    expect(resolverQlik).not.toHaveBeenCalled();
    expect(resolverSesion).not.toHaveBeenCalled();
  });
});

describe("GET /:id/workspace", () => {
  it("deniega el script de Qlik Automate a usuarios no administradores", async () => {
    const obtenerAutomatizacion = vi.fn(async () => ({
      id: "auto-1",
      name: "Reporte",
      schedules: [],
      workspace: { blocks: [] },
    }));
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () =>
        ({ obtenerAutomatizacion }) as unknown as ServicioQlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "usuario-1",
        organizacionId: "organizacion-1",
        usuarioIdQlik: "usuario-qlik-id",
      }),
      consultaTenant: {} as never,
    });

    const respuesta = await rutas.request("/auto-1/workspace");

    expect(respuesta.status).toBe(403);
    expect(obtenerAutomatizacion).not.toHaveBeenCalled();
  });

  it("permite consultar el workspace a un administrador", async () => {
    const obtenerAutomatizacion = vi.fn(async () => ({
      id: "auto-1",
      name: "Reporte",
      schedules: [],
      workspace: { blocks: [] },
    }));
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () =>
        ({ obtenerAutomatizacion }) as unknown as ServicioQlik,
      resolverSesion: async () =>
        ({
          tenantId: "tenant-1",
          usuarioId: "admin-1",
          organizacionId: "organizacion-1",
          usuarioIdQlik: "admin-qlik-id",
          esSuperadmin: false,
          roles: ["admin"],
        }) as never,
      consultaTenant: {} as never,
    });

    const respuesta = await rutas.request("/auto-1/workspace");

    expect(respuesta.status).toBe(200);
    expect(obtenerAutomatizacion).toHaveBeenCalledWith("auto-1");
  });

  it("mantiene el workspace en solo lectura incluso para administradores", async () => {
    const actualizarAutomatizacion = vi.fn(async () => ({
      id: "auto-1",
      name: "Reporte",
      workspace: { blocks: [] },
    }));
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () =>
        ({ actualizarAutomatizacion }) as unknown as ServicioQlik,
      resolverSesion: async () =>
        ({
          tenantId: "tenant-1",
          usuarioId: "admin-1",
          organizacionId: "organizacion-1",
          usuarioIdQlik: "admin-qlik-id",
          esSuperadmin: false,
          roles: ["admin"],
        }) as never,
      consultaTenant: {} as never,
    });

    const respuesta = await rutas.request("/auto-1/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: { blocks: [] } }),
    });

    expect(respuesta.status).toBe(405);
    expect(actualizarAutomatizacion).not.toHaveBeenCalled();
  });
});

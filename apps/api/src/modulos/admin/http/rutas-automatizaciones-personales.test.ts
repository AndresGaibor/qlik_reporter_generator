import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import type { ServicioQlik } from "../../qlik/publico.js";
import type { PuertoRepositorioAutomatizacionesPersonales } from "../../reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import type { RepositorioAdministracion } from "../aplicacion/puertos/repositorio-administracion.js";
import { crearRutasAutomatizacionesPersonales } from "./rutas-automatizaciones-personales.js";
import { crearRutasConfiguracionTenant } from "./rutas-configuracion-tenant.js";

function crearApp(dependencias: Record<string, unknown>) {
  const app = new Hono();
  app.route("/api/admin", crearRutasConfiguracionTenant(dependencias as never));
  if (
    dependencias.repositorioAutomatizacionesPersonales &&
    dependencias.resolverIdentidadQlik &&
    dependencias.resolverQlik
  ) {
    app.route(
      "/api/admin",
      crearRutasAutomatizacionesPersonales(dependencias as never),
    );
  }
  return app;
}

function contextoAdmin() {
  return {
    esSuperadmin: false,
    usuarioId: "usuario-admin",
    membresias: [
      {
        organizacionId: "org-1",
        organizacionNombre: "Empresa",
        rol: "admin" as const,
      },
    ],
  };
}

function repositorioBase() {
  return {
    configurarAutomatizacionBase: vi.fn(async () => ({
      id: "tenant-1",
      organizacionId: "org-1",
      tenantIdQlik: "tenant-qlik",
      host: "tenant.qlik.com",
      nombre: "Tenant",
      estado: "activo" as const,
      esPrincipal: true,
    })),
  } as unknown as RepositorioAdministracion;
}

function workspaceValido() {
  return {
    blocks: [
      {
        name: "executeTask",
        inputs: [
          {
            mode: "keyValue",
            value: [
              { key: "credenciales", value: "{ $.Credenciales }" },
              { key: "bq_number_csv", value: "{ $.BqNumberCsv }" },
              { key: "bq_export_data", value: "{ $.BqExportData }" },
              { key: "jobid", value: "{ $.JobId }" },
              { key: "projectid", value: "{ $.ProjectId }" },
            ],
          },
        ],
      },
      ...[
        "Credenciales",
        "BqNumberCsv",
        "BqExportData",
        "JobId",
        "ProjectId",
      ].map((name) => ({ name, operations: [{ id: "set_value", value: "" }] })),
    ],
  };
}

function workerPersistido() {
  return {
    id: "worker-row-1",
    organizacionId: "org-1",
    tenantQlikId: "tenant-1",
    usuarioId: "usuario-1",
    automatizacionIdQlik: "old-broken-auto",
    automatizacionNombreSnapshot: "Worker roto",
    estado: "error" as const,
    mensajeError: "Contrato incompatible",
  };
}

describe("administración de automatizaciones personales", () => {
  it("rechaza una plantilla incompatible y no persiste el tenant", async () => {
    const repositorio = repositorioBase();
    const qlik = {
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "base-1",
        name: "Plantilla rota",
        workspace: { blocks: [] },
      })),
    } as unknown as ServicioQlik;

    const respuesta = await crearApp({
      repositorio,
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/automatizacion-base",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automatizacionBaseIdQlik: "base-1",
          automatizacionBaseNombre: "Plantilla rota",
        }),
      },
    );
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(422);
    expect(cuerpo.error.codigo).toBe("PLANTILLA_INCOMPATIBLE");
    expect(repositorio.configurarAutomatizacionBase).not.toHaveBeenCalled();
  });

  it("propaga un error transitorio al leer la plantilla y no persiste", async () => {
    const repositorio = repositorioBase();
    const error = new Error("Qlik temporalmente no disponible");
    const qlik = {
      obtenerAutomatizacion: vi.fn(async () => {
        throw error;
      }),
    } as unknown as ServicioQlik;

    const respuesta = await crearApp({
      repositorio,
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/automatizacion-base",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automatizacionBaseIdQlik: "base-1" }),
      },
    );

    expect(respuesta.status).toBe(500);
    expect(repositorio.configurarAutomatizacionBase).not.toHaveBeenCalled();
  });

  it("lista workers con usuario e identidad Qlik compactos y respeta el alcance", async () => {
    const repositorioWorkers = {
      listarPorTenant: vi.fn(async () => [
        {
          id: "worker-row-1",
          organizacionId: "org-1",
          tenantQlikId: "tenant-1",
          usuarioId: "usuario-1",
          automatizacionIdQlik: "auto-1",
          automatizacionNombreSnapshot: "Worker de Ana",
          estado: "error" as const,
          mensajeError: "Contrato incompatible",
        },
      ]),
    } as unknown as PuertoRepositorioAutomatizacionesPersonales;
    const repositorio = {
      listarUsuarios: vi.fn(async () => [
        {
          id: "usuario-1",
          nombre: "Ana",
          correo: "ana@example.com",
          rol: "usuario" as const,
        },
      ]),
    } as unknown as RepositorioAdministracion;
    const qlik = {} as ServicioQlik;
    const resolverIdentidad = vi.fn(async () => ({
      usuarioIdQlik: "qlik-ana",
      nombreQlik: "Ana Qlik",
      correoQlik: "ana@example.com",
    }));

    const respuesta = await crearApp({
      repositorio,
      repositorioAutomatizacionesPersonales: repositorioWorkers,
      resolverIdentidadQlik: { obtener: resolverIdentidad },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request("/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos).toEqual([
      expect.objectContaining({
        id: "worker-row-1",
        usuarioNombre: "Ana",
        usuarioCorreo: "ana@example.com",
        usuarioIdQlik: "qlik-ana",
        automatizacionIdQlik: "auto-1",
        automatizacionNombre: "Worker de Ana",
        estado: "error",
        mensajeError: "Contrato incompatible",
      }),
    ]);
  });

  it("recrea el mismo worker resolviendo el propietario Qlik en servidor", async () => {
    const worker = workerPersistido();
    const actualizarScoped = vi.fn(
      async (_id: string, cambios: Record<string, unknown>) => ({
        ...worker,
        ...cambios,
      }),
    );
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockResolvedValueOnce({
          id: "base-1",
          name: "Base",
          workspace: workspaceValido(),
        })
        .mockResolvedValueOnce({
          id: "new-auto",
          name: "Automatización personal",
          workspace: workspaceValido(),
        }),
      copiarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      actualizarAutomatizacion: vi.fn(async (_id, definicion) => ({
        id: "new-auto",
        ...definicion,
      })),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    } as unknown as ServicioQlik;
    const repositorioWorkers = {
      listarPorTenant: vi.fn(async () => [worker]),
      actualizarScoped,
    } as unknown as PuertoRepositorioAutomatizacionesPersonales;
    const repositorio = {
      listarTenantsQlik: vi.fn(async () => [
        {
          id: "tenant-1",
          automatizacionBaseIdQlik: "base-1",
          automatizacionBaseNombre: "Base",
        },
      ]),
    } as unknown as RepositorioAdministracion;

    const respuesta = await crearApp({
      repositorio,
      repositorioAutomatizacionesPersonales: repositorioWorkers,
      resolverIdentidadQlik: {
        obtener: vi.fn(async () => ({ usuarioIdQlik: "server-owner" })),
      },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioIdQlik: "attacker-owner" }),
      },
    );

    expect(respuesta.status).toBe(200);
    expect(qlik.cambiarPropietarioAutomatizacion).toHaveBeenCalledWith(
      "new-auto",
      "server-owner",
    );
    expect(actualizarScoped).toHaveBeenCalledWith(
      "worker-row-1",
      "org-1",
      "tenant-1",
      expect.objectContaining({
        automatizacionIdQlik: "new-auto",
        estado: "activo",
        mensajeError: null,
      }),
    );
    expect(qlik.actualizarAutomatizacion).not.toHaveBeenCalledWith(
      "old-broken-auto",
      expect.anything(),
    );
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalledWith(
      "old-broken-auto",
    );
  });

  it("no actualiza la asociación cuando la nueva copia es incompatible y limpia solo esa copia", async () => {
    const worker = workerPersistido();
    const actualizar = vi.fn();
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockResolvedValueOnce({
          id: "base-1",
          name: "Base",
          workspace: workspaceValido(),
        })
        .mockResolvedValueOnce({
          id: "new-auto",
          name: "Nueva",
          workspace: { blocks: [] },
        }),
      copiarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      actualizarAutomatizacion: vi.fn(),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    } as unknown as ServicioQlik;
    const respuesta = await crearApp({
      repositorio: {
        listarTenantsQlik: vi.fn(async () => [
          { id: "tenant-1", automatizacionBaseIdQlik: "base-1" },
        ]),
      },
      repositorioAutomatizacionesPersonales: {
        listarPorTenant: vi.fn(async () => [worker]),
        actualizarScoped: actualizar,
      },
      resolverIdentidadQlik: {
        obtener: vi.fn(async () => ({ usuarioIdQlik: "server-owner" })),
      },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
      { method: "POST" },
    );

    expect(respuesta.status).toBe(422);
    expect(actualizar).not.toHaveBeenCalled();
    expect(qlik.eliminarAutomatizacion).toHaveBeenCalledWith("new-auto");
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalledWith(
      "old-broken-auto",
    );
  });

  it.each(["owner", "GET", "PUT"] as const)(
    "limpia la copia nueva si falla %s",
    async (_nombre) => {
      const worker = workerPersistido();
      const error = new Error(`${_nombre} down`);
      const obtenerAutomatizacion = vi.fn();
      obtenerAutomatizacion.mockResolvedValueOnce({
        id: "base-1",
        workspace: workspaceValido(),
      });
      if (_nombre === "GET") obtenerAutomatizacion.mockRejectedValueOnce(error);
      else
        obtenerAutomatizacion.mockResolvedValueOnce({
          id: "new-auto",
          workspace: workspaceValido(),
        });
      const qlik = {
        obtenerAutomatizacion,
        copiarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
        cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
        actualizarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
        eliminarAutomatizacion: vi.fn(async () => undefined),
      };
      if (_nombre === "owner")
        qlik.cambiarPropietarioAutomatizacion.mockRejectedValueOnce(error);
      if (_nombre === "PUT")
        qlik.actualizarAutomatizacion.mockRejectedValueOnce(error);
      const actualizar = vi.fn();
      const respuesta = await crearApp({
        repositorio: {
          listarTenantsQlik: vi.fn(async () => [
            { id: "tenant-1", automatizacionBaseIdQlik: "base-1" },
          ]),
        },
        repositorioAutomatizacionesPersonales: {
          listarPorTenant: vi.fn(async () => [worker]),
          actualizarScoped: actualizar,
        },
        resolverIdentidadQlik: {
          obtener: vi.fn(async () => ({ usuarioIdQlik: "server-owner" })),
        },
        resolverContexto: async () => contextoAdmin(),
        resolverQlik: async () => qlik as unknown as ServicioQlik,
      }).request(
        "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
        { method: "POST" },
      );

      expect(respuesta.status).toBe(500);
      expect(qlik.eliminarAutomatizacion).toHaveBeenCalledWith("new-auto");
      expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalledWith(
        "old-broken-auto",
      );
      expect(actualizar).not.toHaveBeenCalled();
    },
  );

  it("limpia la copia nueva si falla la asociación scoped", async () => {
    const worker = workerPersistido();
    const error = new Error("db down");
    const actualizarScoped = vi.fn(async () => {
      throw error;
    });
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockResolvedValueOnce({ id: "base-1", workspace: workspaceValido() })
        .mockResolvedValueOnce({
          id: "new-auto",
          workspace: workspaceValido(),
        }),
      copiarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      actualizarAutomatizacion: vi.fn(async () => ({ id: "new-auto" })),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    } as unknown as ServicioQlik;
    const respuesta = await crearApp({
      repositorio: {
        listarTenantsQlik: vi.fn(async () => [
          { id: "tenant-1", automatizacionBaseIdQlik: "base-1" },
        ]),
      },
      repositorioAutomatizacionesPersonales: {
        listarPorTenant: vi.fn(async () => [worker]),
        actualizarScoped,
      },
      resolverIdentidadQlik: {
        obtener: vi.fn(async () => ({ usuarioIdQlik: "server-owner" })),
      },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () => qlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
      { method: "POST" },
    );

    expect(respuesta.status).toBe(500);
    expect(qlik.eliminarAutomatizacion).toHaveBeenCalledWith("new-auto");
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalledWith(
      "old-broken-auto",
    );
  });

  it("rechaza el listado fuera del alcance de la organización", async () => {
    const respuesta = await crearApp({
      repositorio: { listarUsuarios: vi.fn() },
      repositorioAutomatizacionesPersonales: { listarPorTenant: vi.fn() },
      resolverIdentidadQlik: { obtener: vi.fn() },
      resolverContexto: async () => ({ ...contextoAdmin(), membresias: [] }),
      resolverQlik: async () => ({}) as ServicioQlik,
    }).request("/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers");

    expect(respuesta.status).toBe(403);
  });

  it("no crea ni actualiza si falta la plantilla o la identidad del usuario", async () => {
    const copiar = vi.fn();
    const actualizar = vi.fn();
    const worker = workerPersistido();
    const base = {
      listarPorTenant: vi.fn(async () => [worker]),
      actualizarScoped: actualizar,
    } as unknown as PuertoRepositorioAutomatizacionesPersonales;
    const respuestaSinBase = await crearApp({
      repositorio: {
        listarTenantsQlik: vi.fn(async () => [{ id: "tenant-1" }]),
      },
      repositorioAutomatizacionesPersonales: base,
      resolverIdentidadQlik: { obtener: vi.fn() },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () =>
        ({ copiarAutomatizacion: copiar }) as unknown as ServicioQlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
      { method: "POST" },
    );
    expect(respuestaSinBase.status).toBe(422);
    expect(copiar).not.toHaveBeenCalled();

    const respuestaSinIdentidad = await crearApp({
      repositorio: {
        listarTenantsQlik: vi.fn(async () => [
          { id: "tenant-1", automatizacionBaseIdQlik: "base-1" },
        ]),
      },
      repositorioAutomatizacionesPersonales: base,
      resolverIdentidadQlik: { obtener: vi.fn(async () => null) },
      resolverContexto: async () => contextoAdmin(),
      resolverQlik: async () =>
        ({ copiarAutomatizacion: copiar }) as unknown as ServicioQlik,
    }).request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-1/workers/worker-row-1/recrear",
      { method: "POST" },
    );
    expect(respuestaSinIdentidad.status).toBe(422);
    expect(actualizar).not.toHaveBeenCalled();
  });
});

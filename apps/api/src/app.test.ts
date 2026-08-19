import { describe, expect, it, vi } from "bun:test";
import { crearAplicacion } from "./app.js";
import type { PuertoBloqueoEjecucion } from "./modulos/automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoConsultaTenantQlik } from "./modulos/automatizaciones/aplicacion/puertos/puerto-consulta-tenant-qlik.js";
import type { PuertoRepositorioAutomatizacionesPersonales } from "./modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import type { Registrador } from "./plataforma/observabilidad/registrador.js";

function crearRegistradorPrueba(): Registrador {
  return {
    info: () => undefined,
    advertencia: () => undefined,
    error: () => undefined,
  };
}

describe("API", () => {
  it("expone el estado de salud con el contrato común", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });
    const respuesta = await app.request("/api/salud");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.exito).toBe(true);
    expect(cuerpo.datos.estado).toBe("ok");
    expect(cuerpo.datos.arquitectura).toBe("monolito-modular");
    expect(cuerpo.datos.fecha).toBeDefined();
  });

  it("normaliza rutas inexistentes", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });
    const respuesta = await app.request("/api/inexistente");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(404);
    expect(cuerpo).toMatchObject({
      exito: false,
      error: {
        codigo: "RUTA_NO_ENCONTRADA",
        mensaje: "Ruta no encontrada",
      },
    });
  });

  it("aplica cabeceras defensivas a las respuestas", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      configuracion: {
        NODE_ENV: "production",
        PORT: 3000,
        FRONTEND_URL: "https://app.example.com",
        DATABASE_URL: "postgres://usuario:clave@localhost:5432/app",
        QLIK_REDIRECT_URI: "https://api.example.com/api/auth/qlik/callback",
        QLIK_OAUTH_TIMEOUT_MS: 10_000,
        GOOGLE_SIGNED_URL_MINUTOS: 15,
      },
    });

    const respuesta = await app.request("/api/salud");

    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(respuesta.headers.get("x-frame-options")).toBe("DENY");
    expect(respuesta.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(respuesta.headers.get("strict-transport-security")).toContain(
      "max-age=",
    );
  });

  it("rechaza mutaciones sin Origin o con Origin ajeno al frontend", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });

    const sinOrigen = await app.request("/api/auth/qlik/cerrar-sesion", {
      method: "POST",
    });
    const origenAjeno = await app.request("/api/auth/qlik/cerrar-sesion", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });

    expect(sinOrigen.status).toBe(403);
    expect(origenAjeno.status).toBe(403);
  });

  it("permite mutaciones del FRONTEND_URL", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });

    const respuesta = await app.request("/api/auth/qlik/cerrar-sesion", {
      method: "POST",
      headers: { Origin: "http://localhost:4525" },
    });

    expect(respuesta.status).toBe(200);
  });

  it("mapea errores no controlados sin exponer detalles", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });
    app.get("/api/__prueba-error", () => {
      throw new Error("secreto interno");
    });

    const respuesta = await app.request("/api/__prueba-error");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(500);
    expect(cuerpo.exito).toBe(false);
    expect(cuerpo.error.codigo).toBe("INTERNO");
    expect(cuerpo.error.mensaje).toBe("Error interno del servidor");
    expect(JSON.stringify(cuerpo)).not.toContain("secreto interno");
  });

  it("permite invocar las rutas PUT de automatización base en admin", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverContextoAdmin: async () => ({
        esSuperadmin: true,
        membresias: [],
      }),
      repositorioAdministracion: {
        listarOrganizaciones: async () => [],
        obtenerOrganizacion: async () => null,
        crearOrganizacion: async () => ({
          id: "1",
          nombre: "t",
          estado: "activa",
          creadoEn: new Date(),
        }),
        actualizarOrganizacion: async () => null,
        eliminarOrganizacion: async () => true,
        listarUsuarios: async () => [],
        agregarUsuario: async () => null,
        actualizarRolUsuario: async () => null,
        eliminarUsuario: async () => true,
        listarTenantsQlik: async () => [],
        crearTenantQlik: async () => null,
        marcarTenantQlikPrincipal: async () => null,
        configurarAutomatizacionBase: async () => ({
          id: "t1",
          organizacionId: "org1",
          tenantIdQlik: "q1",
          host: "test.qlikcloud.com",
          nombre: "test",
          estado: "activo",
          esPrincipal: true,
          automatizacionBaseIdQlik: "auto1",
          automatizacionBaseNombre: "Base Auto",
          creadoEn: new Date(),
        }),
        configurarDataflowBase: async () => ({
          id: "t1",
          organizacionId: "org1",
          tenantIdQlik: "q1",
          host: "test.qlikcloud.com",
          nombre: "test",
          estado: "activo",
          esPrincipal: true,
          dataflowBaseIdQlik: "flow1",
          dataflowBaseNombre: "Base Ventas",
          creadoEn: new Date(),
        }),
        eliminarTenantQlik: async () => "ELIMINADO",
        obtenerConfiguracionOAuth: async () => null,
        guardarConfiguracionOAuth: async () => null,
        eliminarConfiguracionOAuth: async () => false,
        listarSuperadmins: async () => [],
        agregarSuperadmin: async () => ({
          id: "1",
          nombre: "Admin",
          correo: "a@b.com",
          esSuperadmin: true,
          estado: "activo",
          creadoEn: new Date(),
        }),
        eliminarSuperadmin: async () => ({ exito: true }),
      },
    });

    const res1 = await app.request(
      "/api/admin/tenants/org1/qlik/t1/automatizacion-base",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4525",
        },
        body: JSON.stringify({
          automatizacionBaseIdQlik: "auto1",
          automatizacionBaseNombre: "Base Auto",
        }),
      },
    );
    expect(res1.status).toBe(200);

    const res2 = await app.request(
      "/api/admin/organizaciones/org1/tenants-qlik/t1/automatizacion-base",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4525",
        },
        body: JSON.stringify({
          automatizacionBaseIdQlik: "auto1",
          automatizacionBaseNombre: "Base Auto",
        }),
      },
    );
    expect(res2.status).toBe(200);

    const resDataflow = await app.request(
      "/api/admin/organizaciones/org1/tenants-qlik/t1/dataflow-base",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4525",
        },
        body: JSON.stringify({
          dataflowBaseIdQlik: "flow1",
          dataflowBaseNombre: "Base Ventas",
        }),
      },
    );
    expect(resDataflow.status).toBe(200);
  });
  it("monta GET /api/flujos con datos de Qlik", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () =>
        ({
          listarFlujos: async () => [
            { id: "flow-1", name: "Ventas Comercial", spaceId: undefined },
          ],
          listarEspacios: async () => [],
        }) as never,
    } as Parameters<typeof crearAplicacion>[0] & Record<string, unknown>);

    const respuesta = await app.request("/api/flujos");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo).toMatchObject({
      exito: true,
      datos: [{ id: "flow-1", nombre: "Ventas Comercial" }],
    });
  });

  it("rechaza GET /api/flujos cuando la sesión no tiene Qlik", async () => {
    const { ErrorNoAutorizado } = await import(
      "./nucleo/errores/error-aplicacion.js"
    );
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () => {
        throw new ErrorNoAutorizado("Sesión requerida");
      },
    } as Parameters<typeof crearAplicacion>[0] & Record<string, unknown>);

    const respuesta = await app.request("/api/flujos");
    expect(respuesta.status).toBe(401);
  });

  it("monta el preflight Dataflow bajo /api/reportes", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () =>
        ({
          obtenerScriptApp: async () => ({
            script:
              "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;",
          }),
        }) as never,
      resolverBigQueryReporte: async () => ({
        projectId: "p",
        dataset: "d",
        estimador: {
          estimarConsulta: async () => ({
            bytesProcesados: 10,
            costoEstimadoUsd: 0,
          }),
        },
      }),
    } as Parameters<typeof crearAplicacion>[0] & Record<string, unknown>);

    const respuesta = await app.request(
      "/api/reportes/dataflows/flujo-1/preflight",
    );
    const cuerpo = await respuesta.json();
    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos.compatible).toBe(true);
  });

  it("resuelve el clonado público como reporte local en la composición completa", async () => {
    const copiarAutomatizacion = vi.fn();
    const crearReporte = vi.fn(async (entrada: Record<string, unknown>) => ({
      id: "reporte-copia",
      ...entrada,
    }));
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () => ({ copiarAutomatizacion }) as never,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "user-2",
        organizacionId: "org-1",
        usuarioIdQlik: "user-2-qlik",
      }),
      repositorioReportes: {
        obtenerPorId: vi.fn(async () => ({
          id: "reporte-1",
          tenantQlikId: "tenant-1",
          organizacionId: "org-1",
          creadoPorUsuarioId: "user-1",
          nombre: "Ventas",
          flujoIdQlik: "df-1",
          flujoNombreSnapshot: "Ventas DF",
          estado: "activa" as const,
        })),
        crearReporte,
      } as never,
    });

    const respuesta = await app.request("/api/reportes/reporte-1/clonar", {
      method: "POST",
      headers: {
        Origin: "http://localhost:4525",
        "content-type": "application/json",
      },
      body: JSON.stringify({ nombre: "Ventas copia" }),
    });

    expect(respuesta.status).toBe(200);
    expect(crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ventas copia" }),
    );
    expect(copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("inyecta las dependencias de ejecución y falla cerrado sin plantilla base", async () => {
    const obtenerTenant = vi.fn(async () => ({ host: "tenant.example" }));
    const ejecutarExclusivo = vi.fn(
      async (_clave: string, tarea: () => Promise<unknown>) => tarea(),
    ) as unknown as PuertoBloqueoEjecucion["ejecutarExclusivo"];
    const obtener = vi.fn();
    const copiarAutomatizacion = vi.fn();
    const resolverQlik = vi.fn(async () => ({ copiarAutomatizacion }) as never);
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        usuarioIdQlik: "usuario-qlik-1",
      }),
      resolverQlik,
      consultaTenantQlik: { obtenerTenant } satisfies PuertoConsultaTenantQlik,
      repositorioAutomatizacionesPersonales: {
        obtener,
      } as unknown as PuertoRepositorioAutomatizacionesPersonales,
      bloqueoEjecucion: { ejecutarExclusivo } satisfies PuertoBloqueoEjecucion,
      repositorioReportes: {} as never,
    });

    const respuesta = await app.request("/api/reportes/reporte-1/ejecuciones", {
      method: "POST",
      headers: { Origin: "http://localhost:4525" },
    });

    expect(respuesta.status).toBe(422);
    expect((await respuesta.json()).error.codigo).toBe(
      "SIN_AUTOMATIZACION_BASE",
    );
    expect(obtenerTenant).toHaveBeenCalledWith("tenant-1");
    expect(resolverQlik).not.toHaveBeenCalled();
    expect(obtener).not.toHaveBeenCalled();
    expect(ejecutarExclusivo).not.toHaveBeenCalled();
    expect(copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("compone la ejecución con plantilla, worker y lock inyectados sin IDs del cliente", async () => {
    const workspace = {
      blocks: [
        {
          name: "executeTask",
          inputs: [
            {
              mode: "keyValue",
              value: [
                { key: "credenciales", value: "credenciales" },
                { key: "bq_select_data", value: "{ $.BqSelectData }" },
                { key: "bq_number_csv", value: "{ $.BqNumberCsv }" },
                { key: "bq_export_data", value: "{ $.BqExportData }" },
                { key: "bq_drop", value: "{ $.BqDrop }" },
              ],
            },
          ],
        },
        ...["BqSelectData", "BqNumberCsv", "BqExportData", "BqDrop"].map(
          (name) => ({ name, operations: [{ id: "set_value", value: "" }] }),
        ),
      ],
    };
    const tenant = vi.fn(async () => ({
      host: "tenant.example",
      automatizacionBaseIdQlik: "base-from-tenant",
      automatizacionBaseNombre: "Base Talend",
    }));
    const lock = vi.fn(async (_clave: string, tarea: () => Promise<unknown>) =>
      tarea(),
    ) as unknown as PuertoBloqueoEjecucion["ejecutarExclusivo"];
    const workerRepo = {
      obtener: vi.fn(async () => null),
      crear: vi.fn(async (entrada: Record<string, unknown>) => ({
        id: "66666666-6666-4666-8666-666666666666",
        ...entrada,
      })),
    };
    const copiar = vi.fn(async (id: string) => {
      expect(id).toBe("base-from-tenant");
      return { id: "77777777-7777-4777-8777-777777777777" };
    });
    const obtenerAutomatizacion = vi.fn(async (id: string) => ({
      id,
      name: id === "base-from-tenant" ? "Base Talend" : "Worker personal",
      workspace,
      schedules: [],
    }));
    const qlik = {
      copiarAutomatizacion: copiar,
      obtenerAutomatizacion,
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      actualizarAutomatizacion: vi.fn(async () => ({ id: "worker" })),
      ejecutarAutomatizacion: vi.fn(async () => ({ runId: "run-1" })),
      obtenerScriptApp: vi.fn(async () => ({
        script:
          "LIB CONNECT TO [Google BigQuery:Produccion]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;",
      })),
    };
    const ejecucionRepo = {
      obtenerPorId: vi.fn(async () => ({
        id: "88888888-8888-4888-8888-888888888888",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "11111111-1111-4111-8111-111111111111",
        nombre: "Ventas",
        flujoIdQlik: "flow-1",
        flujoNombreSnapshot: "Ventas",
        flujoEspacioIdQlik: null,
        estado: "activa" as const,
      })),
      crearEjecucion: vi.fn(
        async (entrada: Record<string, unknown>) => entrada,
      ),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        usuarioIdQlik: "usuario-qlik-1",
      }),
      resolverQlik: async () => qlik as never,
      resolverBigQueryReporte: async () => ({
        projectId: "p",
        dataset: "d",
        estimador: { estimarConsulta: vi.fn() },
      }),
      consultaTenantQlik: { obtenerTenant: tenant },
      repositorioAutomatizacionesPersonales: workerRepo as never,
      bloqueoEjecucion: { ejecutarExclusivo: lock },
      repositorioReportes: ejecucionRepo as never,
    });

    const respuesta = await app.request("/api/reportes/reporte-1/ejecuciones", {
      method: "POST",
      headers: {
        Origin: "http://localhost:4525",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        automatizacionIdQlik: "client-controlled",
        plantillaIdQlik: "client-controlled",
      }),
    });

    expect(respuesta.status).toBe(200);
    expect(tenant).toHaveBeenCalledWith("tenant-1");
    expect(copiar).toHaveBeenCalledWith(
      "base-from-tenant",
      "Base Talend - Worker personal",
    );
    expect(workerRepo.obtener).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "tenant-1",
    );
    expect(lock).toHaveBeenCalled();
    expect(ejecucionRepo.crearEjecucion).toHaveBeenCalledWith(
      expect.objectContaining({
        ejecutadoPorUsuarioId: "11111111-1111-4111-8111-111111111111",
        automatizacionPersonalId: "66666666-6666-4666-8666-666666666666",
      }),
    );
  });

  it("separa el panel Qlik del listado y rutas canónicas de reportes", async () => {
    const listarAutomatizaciones = vi.fn(async () => [
      { id: "qlik-auto-1", name: "QLIK GENERATOR Panel técnico" },
    ]);
    const resolverQlik = vi.fn(
      async () =>
        ({ listarAutomatizaciones, listarEspacios: async () => [] }) as never,
    );
    const listar = vi.fn(async () => []);
    const obtenerPorId = vi.fn(async () => null);
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        usuarioIdQlik: "usuario-qlik-1",
      }),
      consultaTenantQlik: {
        obtenerTenant: async () => ({
          host: "tenant.example",
          automatizacionBaseIdQlik: "base-tenant-1",
          automatizacionBaseNombre: "Base tenant 1",
        }),
      },
      repositorioReportes: { listar, obtenerPorId } as never,
    });

    const panel = await app.request(
      "/api/qlik/automatizaciones?incluirBase=true",
    );
    const reportes = await app.request("/api/reportes");
    const configuracionTenant = await app.request(
      "/api/reportes/configuracion-tenant",
    );

    expect(panel.status).toBe(200);
    expect((await panel.json()).datos).toMatchObject([
      { id: "qlik-auto-1", nombre: "QLIK GENERATOR Panel técnico" },
    ]);
    expect(reportes.status).toBe(200);
    expect((await reportes.json()).datos).toEqual([]);
    expect(configuracionTenant.status).toBe(410);
    expect((await configuracionTenant.json()).error.codigo).toBe(
      "ENDPOINT_DEPRECADO",
    );
    expect(obtenerPorId).not.toHaveBeenCalled();
    const configuracionTecnica = await app.request(
      "/api/qlik/automatizaciones/configuracion-tenant",
    );
    expect(configuracionTecnica.status).toBe(200);
    expect((await configuracionTecnica.json()).datos).toEqual({
      automatizacionBaseIdQlik: "base-tenant-1",
      automatizacionBaseNombre: "Base tenant 1",
    });
    expect(listar).toHaveBeenCalledWith({
      tenantQlikId: "tenant-1",
      organizacionId: "org-1",
    });
    expect(resolverQlik).toHaveBeenCalledTimes(1);
  });
});

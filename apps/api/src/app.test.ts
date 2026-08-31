import { describe, expect, it, vi } from "bun:test";
import { crearAplicacion } from "./app.js";
import type { PuertoBloqueoEjecucion } from "./modulos/automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoConsultaTenantQlik } from "./modulos/automatizaciones/aplicacion/puertos/puerto-consulta-tenant-qlik.js";
import type { PuertoLecturaBigQuery } from "./modulos/google-cloud/aplicacion/puerto-lectura-bigquery.js";
import type { PuertoRepositorioAutomatizacionesPersonales } from "./modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import type { Registrador } from "./plataforma/observabilidad/registrador.js";

process.env.CIFRADO_CLAVE_PRINCIPAL ??= Buffer.alloc(32).toString("base64");
process.env.FRONTEND_URL ??= "http://localhost:4525";

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
      resolverQlik: async () =>
        ({
          obtenerAutomatizacion: async () => ({
            workspace: {
              blocks: [
                {
                  name: "executeTask",
                  inputs: [
                    {
                      mode: "keyValue",
                      value: [
                        { key: "job_id", value: "{ $.jobid }" },
                        { key: "id_projecto", value: "{ $.projectid }" },
                        { key: "credenciales", value: "{ $.Credenciales }" },
                        { key: "sql", value: "{ $.sql }" },
                      ],
                    },
                  ],
                },
                ...["jobid", "projectid", "Credenciales", "sql"].map(
                  (name) => ({
                    name,
                    operations: [{ id: "set_value", value: "" }],
                  }),
                ),
              ],
            },
          }),
        }) as never,
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
          plantillas: [{ id: "flow1", nombre: "Base Ventas" }],
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

  it("monta el preflight canónico del Dataflow bajo /api/reportes/:flujoId", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () =>
        ({
          listarFlujos: async () => [
            { id: "flujo-1", name: "Ventas", spaceId: "espacio-1" },
          ],
          listarEspacios: async () => [],
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

    const respuesta = await app.request("/api/reportes/flujo-1/preflight");
    const cuerpo = await respuesta.json();
    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos).toMatchObject({
      flujoIdQlik: "flujo-1",
      compatible: true,
    });
  });

  it("conecta el resolver BigQuery de preview en el composition root", async () => {
    const mockPreview: PuertoLecturaBigQuery = {
      obtenerMetadataTabla: async () => ({
        columnas: [{ nombre: "id", tipo: "INT64", modo: "NULLABLE" }],
      }),
      obtenerFilasPreview: async () => ({
        columnas: ["id"],
        filas: [["101"]],
      }),
    };
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik: async () =>
        ({
          listarFlujos: async () => [
            { id: "flujo-1", name: "Ventas", spaceId: "espacio-1" },
          ],
          listarEspacios: async () => [],
          obtenerScriptApp: async () => ({
            script:
              "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;",
          }),
        }) as never,
      resolverPreviewBigQueryReporte: async () => ({
        clientePreview: mockPreview,
      }),
    } as Parameters<typeof crearAplicacion>[0] & Record<string, unknown>);

    const respuesta = await app.request("/api/reportes/flujo-1/preview");
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo).toMatchObject({
      exito: true,
      datos: { esAproximacion: true },
    });
  });

  it("no expone una ruta de clonado local de reportes", async () => {
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
    });

    const respuesta = await app.request("/api/reportes/reporte-1/clonar", {
      method: "POST",
      headers: { Origin: "http://localhost:4525" },
    });

    expect(respuesta.status).toBe(404);
  });

  it("falla cerrado si el servidor no tiene plantilla base para ejecutar un Dataflow", async () => {
    const obtenerTenant = vi.fn(async () => ({ host: "tenant.example" }));
    const resolverQlik = vi.fn(
      async () =>
        ({
          listarFlujos: async () => [{ id: "flujo-1", name: "Ventas" }],
          listarEspacios: async () => [],
        }) as never,
    );
    const obtener = vi.fn();
    const ejecutarExclusivo = vi.fn(
      async (_clave: string, tarea: () => Promise<unknown>) => tarea(),
    ) as unknown as PuertoBloqueoEjecucion["ejecutarExclusivo"];
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

    const respuesta = await app.request("/api/reportes/flujo-1/ejecuciones", {
      method: "POST",
      headers: { Origin: "http://localhost:4525" },
    });

    expect(respuesta.status).toBe(422);
    expect((await respuesta.json()).error.codigo).toBe(
      "SIN_AUTOMATIZACION_BASE",
    );
    expect(obtenerTenant).toHaveBeenCalledWith("tenant-1");
    expect(resolverQlik).toHaveBeenCalledTimes(1);
    expect(obtener).not.toHaveBeenCalled();
    expect(ejecutarExclusivo).not.toHaveBeenCalled();
  });

  it("ejecuta por flujoId con worker y plantilla resueltos por el servidor", async () => {
    const workspace = {
      blocks: [
        {
          name: "executeTask",
          inputs: [
            {
              mode: "keyValue",
              value: [
                { key: "job_id", value: "{ $.jobid }" },
                { key: "id_projecto", value: "{ $.projectid }" },
                { key: "credenciales", value: "{ $.Credenciales }" },
                { key: "sql", value: "{ $.sql }" },
              ],
            },
          ],
        },
        ...["jobid", "projectid", "Credenciales", "sql"].map((name) => ({
          name,
          operations: [{ id: "set_value", value: "" }],
        })),
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
    const workerPersistido = {
      id: "66666666-6666-4666-8666-666666666666",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      usuarioId: "11111111-1111-4111-8111-111111111111",
      automatizacionIdQlik: "worker-old",
      automatizacionNombreSnapshot: "Worker antiguo",
      estado: "error" as const,
      mensajeError: "estructura antigua",
      contratoVersion: 1,
    };
    const workerRepo = {
      obtener: vi.fn(async () => workerPersistido),
      crear: vi.fn(async (entrada: Record<string, unknown>) => ({
        id: "66666666-6666-4666-8666-666666666666",
        ...entrada,
      })),
      actualizar: vi.fn(
        async (_id: string, cambios: Record<string, unknown>) => ({
          ...workerPersistido,
          ...cambios,
        }),
      ),
    };
    const copiar = vi.fn(async (id: string) => {
      expect(id).toBe("base-from-tenant");
      return { id: "77777777-7777-4777-8777-777777777777" };
    });
    const obtenerAutomatizacion = vi.fn(async (id: string) => ({
      id,
      name: id === "base-from-tenant" ? "Base Talend" : "Worker personal",
      workspace: id === "worker-old" ? {} : workspace,
      schedules: [],
    }));
    const qlik = {
      listarFlujos: vi.fn(async () => [
        { id: "flujo-1", name: "Ventas", spaceId: "espacio-1" },
      ]),
      listarEspacios: vi.fn(async () => []),
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
        correo: "Andres.Gaibor@correo.com",
      }),
      resolverQlik: async () => qlik as never,
      resolverBigQueryReporte: async () => ({
        projectId: "p",
        dataset: "d",
        credencialesJson: '{"type":"service_account","project_id":"p"}',
        estimador: {
          estimarConsulta: vi.fn(async () => ({
            bytesProcesados: 1,
            costoEstimadoUsd: 0,
          })),
        },
      }),
      consultaTenantQlik: { obtenerTenant: tenant },
      repositorioAutomatizacionesPersonales: workerRepo as never,
      bloqueoEjecucion: { ejecutarExclusivo: lock },
      repositorioReportes: ejecucionRepo as never,
    });

    const respuesta = await app.request("/api/reportes/flujo-1/ejecuciones", {
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
    expect(qlik.cambiarPropietarioAutomatizacion).toHaveBeenCalledWith(
      "77777777-7777-4777-8777-777777777777",
      "usuario-qlik-1",
    );
    expect(workerRepo.obtener).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "tenant-1",
    );
    expect(lock).toHaveBeenCalled();
    expect(ejecucionRepo.crearEjecucion).toHaveBeenCalledWith(
      expect.objectContaining({
        flujoIdQlik: "flujo-1",
        automatizacionPersonalId: "66666666-6666-4666-8666-666666666666",
        uriBaseGcs: expect.stringContaining("/andresgaibor/ventas/"),
        scriptExportacion: expect.stringContaining("compression = 'GZIP'"),
      }),
    );
  });

  it("usa Qlik para listado y detalle, sin catálogo local de reportes", async () => {
    const listarFlujos = vi.fn(async () => [
      {
        id: "flujo-1",
        name: "Ventas",
        spaceId: "espacio-1",
        ownerId: "usuario-qlik-1",
      },
    ]);
    const resolverQlik = vi.fn(
      async () => ({ listarFlujos, listarEspacios: async () => [] }) as never,
    );
    const repositorioReportes = {
      listarEjecuciones: vi.fn(async () => []),
      listarUltimasEjecucionesPorFlujo: vi.fn(async () => []),
    };
    const app = await crearAplicacion({
      registrador: crearRegistradorPrueba(),
      resolverQlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        usuarioIdQlik: "usuario-qlik-1",
      }),
      repositorioReportes: repositorioReportes as never,
    });

    const listado = await app.request("/api/reportes");
    const detalle = await app.request("/api/reportes/flujo-1");

    expect(listado.status).toBe(200);
    expect((await listado.json()).datos).toEqual([
      expect.objectContaining({ id: "flujo-1", nombre: "Ventas" }),
    ]);
    expect(detalle.status).toBe(200);
    expect((await detalle.json()).datos).toMatchObject({
      id: "flujo-1",
      nombre: "Ventas",
    });
    expect(listarFlujos).toHaveBeenCalledTimes(2);
    expect(repositorioReportes.listarEjecuciones).not.toHaveBeenCalled();
    expect(
      repositorioReportes.listarUltimasEjecucionesPorFlujo,
    ).toHaveBeenCalledWith("tenant-1", "org-1");
  });
});

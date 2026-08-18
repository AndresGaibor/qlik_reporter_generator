import { describe, expect, it, vi } from "bun:test";
import type { PuertoAuditoria } from "../../../nucleo/auditoria/puerto-auditoria.js";
import type { PuertoIdempotencia } from "../../../nucleo/idempotencia/puerto-idempotencia.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { crearRutasPanelAutomatizaciones } from "./rutas-panel.js";

async function workspaceTalend(): Promise<Record<string, unknown>> {
  const fixture = new URL(
    "../../reportes/fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("POST /desde-plantilla", () => {
  it("asigna la automatización al usuario Qlik de la sesión", async () => {
    const cambiarPropietarioAutomatizacion = vi.fn(async () => undefined);
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "copia-1" })),
      cambiarEspacioAutomatizacion: vi.fn(async () => undefined),
      cambiarPropietarioAutomatizacion,
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "copia-1",
        name: "Nueva",
        schedules: [],
        workspace: await workspaceTalend(),
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion: vi.fn(async () => ({})),
      eliminarAutomatizacion: vi.fn(async () => undefined),
      listarFlujos: vi.fn(async () => [
        { id: "flujo-1", name: "Ventas Dataflow", spaceId: "espacio-1" },
      ]),
      obtenerScriptApp: vi.fn(async () => ({
        script:
          "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;",
      })),
    } as unknown as ServicioQlik;
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () => qlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "usuario-1",
        organizacionId: "organizacion-1",
        usuarioIdQlik: "andres-qlik-id",
      }),
      consultaTenant: {
        obtenerTenant: async () => ({
          host: "tenant.qlikcloud.com",
          automatizacionBaseIdQlik: "plantilla-1",
        }),
      },
      bloqueos: {} as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      auditoria: { registrar: async () => undefined } as PuertoAuditoria,
      repositorioReportes: {
        crearReporte: async (entrada) => ({ id: "config-1", ...entrada }),
        obtenerPorId: async () => null,
        crearEjecucion: async (entrada) => entrada as never,
        marcarEjecucionIniciada: async () => undefined,
        marcarEjecucionError: async () => undefined,
        marcarEjecucionCompletada: async () => undefined,
        listarEjecuciones: async () => [],
        marcarEstadoPorRunQlik: async () => undefined,
        actualizarReporte: async (_id, cambios) => ({
          id: "config-1",
          organizacionId: "organizacion-1",
          tenantQlikId: "tenant-1",
          creadoPorUsuarioId: "usuario-1",
          nombre: String(cambios.nombre ?? "Reporte"),
          flujoIdQlik: String(cambios.flujoIdQlik ?? "flujo-1"),
          flujoNombreSnapshot: String(cambios.flujoNombreSnapshot ?? "Flujo"),
          estado: "activa",
        }),
        listar: async () => [],
        clonarReporte: async () => ({}) as never,
        listarEjecucionesDescargas: async () => [],
        obtenerEjecucionDescarga: async () => null,
      },
      resolverBigQueryReporte: async () => ({
        projectId: "p",
        dataset: "d",
        estimador: {
          estimarConsulta: async () => ({
            bytesProcesados: 1,
            costoEstimadoUsd: 0,
          }),
        },
      }),
    });

    const respuesta = await rutas.request("/desde-plantilla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: "Nueva",
        flujoId: "flujo-1",
        propietarioIdQlik: "byron-qlik-id",
      }),
    });

    expect(respuesta.status).toBe(201);
    expect(cambiarPropietarioAutomatizacion).toHaveBeenLastCalledWith(
      "copia-1",
      "andres-qlik-id",
    );
  });
});

describe("POST /:id/ejecuciones", () => {
  it("recompila el Dataflow antes de disparar Qlik Automate", async () => {
    const orden: string[] = [];
    const obtenerScriptApp = vi.fn(async () => {
      orden.push("current");
      return {
        script:
          "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;",
      };
    });
    const actualizarAutomatizacion = vi.fn(async (_id, definicion) => {
      orden.push("actualizar");
      return { id: "auto-1", name: "Reporte", ...definicion };
    });
    const ejecutarAutomatizacion = vi.fn(async () => {
      orden.push("run");
      return { runId: "run-1" };
    });
    const qlik = {
      listarEjecuciones: vi.fn(async () => []),
      obtenerScriptApp,
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "auto-1",
        name: "Reporte",
        schedules: [],
        workspace: await workspaceTalend(),
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion,
      ejecutarAutomatizacion,
    } as unknown as ServicioQlik;
    const repositorioReportes = {
      crearReporte: async (entrada: never) => entrada,
      obtenerPorId: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        organizacionId: "organizacion-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "usuario-1",
        nombre: "Reporte",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Flujo",
        automatizacionIdQlik: "auto-1",
        reporteId: "reporte-1",
        automatizacionNombreSnapshot: "Reporte",
        programar: false,
        estado: "activa" as const,
      }),
      crearEjecucion: async (entrada: never) => entrada,
      marcarEjecucionIniciada: async () => undefined,
      marcarEjecucionError: async () => undefined,
      marcarEjecucionCompletada: async () => undefined,
    };
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () => qlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "usuario-1",
        organizacionId: "organizacion-1",
        usuarioIdQlik: "andres-qlik-id",
      }),
      consultaTenant: { obtenerTenant: async () => null },
      bloqueos: {
        ejecutarExclusivo: async (
          _clave: string,
          tarea: () => Promise<unknown>,
        ) => tarea(),
      } as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      auditoria: { registrar: async () => undefined } as PuertoAuditoria,
      repositorioReportes: repositorioReportes as never,
      resolverBigQueryReporte: async () => ({
        projectId: "p",
        dataset: "d",
        estimador: {
          estimarConsulta: async () => ({
            bytesProcesados: 1,
            costoEstimadoUsd: 0,
          }),
        },
      }),
    });

    const respuesta = await rutas.request("/auto-1/ejecuciones", {
      method: "POST",
    });
    const cuerpo = (await respuesta.json()) as {
      datos?: { runId?: string; ejecucionReporteId?: string };
    };

    expect(respuesta.status).toBe(201);
    expect(cuerpo.datos?.runId).toBe("run-1");
    expect(cuerpo.datos?.ejecucionReporteId).toBeDefined();
    expect(orden).toEqual(["current", "actualizar", "run"]);
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
      bloqueos: {} as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      auditoria: {} as PuertoAuditoria,
      repositorioReportes: {} as never,
      resolverBigQueryReporte: async () => {
        throw new Error("no debería resolverse BigQuery");
      },
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
      bloqueos: {} as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      auditoria: {} as PuertoAuditoria,
      repositorioReportes: {} as never,
      resolverBigQueryReporte: async () => {
        throw new Error("no debería resolverse BigQuery");
      },
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
      bloqueos: {} as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      auditoria: {} as PuertoAuditoria,
      repositorioReportes: {} as never,
      resolverBigQueryReporte: async () => {
        throw new Error("no debería resolverse BigQuery");
      },
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

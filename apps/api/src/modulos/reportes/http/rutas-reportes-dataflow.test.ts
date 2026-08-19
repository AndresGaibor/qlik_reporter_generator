import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import { crearRutasReportesDataflow } from "./rutas-reportes-dataflow.js";

const SCRIPT = `
LIB CONNECT TO [Google BigQuery:Produccion];
[x]: LOAD [id];
SQL SELECT id FROM \`p.d.t\`;
`;

describe("rutas reportes Dataflow", () => {
  it("lista solo reportes PostgreSQL scoped al tenant y organización", async () => {
    const reporte = {
      id: "11111111-1111-4111-8111-111111111111",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas actual",
      flujoEspacioIdQlik: null,
      estado: "activa" as const,
    };
    const listar = vi.fn(async () => [reporte]);
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({}) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta: vi.fn() },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { listar } as never,
      }),
    );

    const respuesta = await app.request("/api/reportes");

    expect(respuesta.status).toBe(200);
    expect(listar).toHaveBeenCalledWith({
      tenantQlikId: "tenant-1",
      organizacionId: "org-1",
    });
    expect((await respuesta.json()).datos[0]).not.toHaveProperty(
      "automatizacionIdQlik",
    );
  });

  it("ejecuta un reporte local con identidad exacta de la sesión", async () => {
    const ejecutarReporte = vi.fn(async () => ({
      runId: "run-1",
      ejecucionReporteId: "ejecucion-1",
    }));
    const resolverEjecutarReporte = vi.fn(async () => ejecutarReporte);
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({}) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta: vi.fn() },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: {} as never,
        resolverEjecutarReporte,
      }),
    );

    const respuesta = await app.request("/api/reportes/reporte-1/ejecuciones", {
      method: "POST",
    });

    expect(respuesta.status).toBe(200);
    expect(resolverEjecutarReporte).toHaveBeenCalled();
    expect(ejecutarReporte).toHaveBeenCalledWith({
      reporteId: "reporte-1",
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
    });
  });

  it("consulta historial local por el UUID del reporte", async () => {
    const listarEjecuciones = vi.fn(async () => []);
    const obtenerPorId = vi.fn(async () => ({
      id: "reporte-1",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas",
      estado: "activa" as const,
    }));
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({}) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta: vi.fn() },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { obtenerPorId, listarEjecuciones } as never,
      }),
    );

    const respuesta = await app.request("/api/reportes/reporte-1/ejecuciones");

    expect(respuesta.status).toBe(200);
    expect(obtenerPorId).toHaveBeenCalledWith("reporte-1", "tenant-1", "org-1");
    expect(listarEjecuciones).toHaveBeenCalledWith("reporte-1", 100);
  });

  it("crea un reporte local sin copiar un Automate", async () => {
    const crearReporte = vi.fn(async (entrada: Record<string, unknown>) => ({
      id: "11111111-1111-4111-8111-111111111111",
      ...entrada,
    }));
    const copiarAutomatizacion = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () =>
          ({
            obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
            listarFlujos: vi.fn(async () => [
              { id: "df-1", name: "Ventas actual", spaceId: "space-1" },
            ]),
            copiarAutomatizacion,
          }) as never,
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
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { crearReporte } as never,
      }),
    );

    const respuesta = await app.request("/api/reportes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ventas", flujoIdQlik: "df-1" }),
    });

    expect(respuesta.status).toBe(200);
    expect(crearReporte).toHaveBeenCalledTimes(1);
    expect(copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("clona un reporte localmente sin consultar ni copiar Qlik Automate", async () => {
    const crearReporte = vi.fn(async (entrada: Record<string, unknown>) => ({
      id: "22222222-2222-4222-8222-222222222222",
      ...entrada,
    }));
    const obtenerPorId = vi.fn(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas actual",
      flujoEspacioIdQlik: "space-1",
      estado: "activa" as const,
    }));
    const listarFlujos = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({ listarFlujos }) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta: vi.fn() },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-2",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { obtenerPorId, crearReporte } as never,
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/11111111-1111-4111-8111-111111111111/clonar",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: "Ventas copia" }),
      },
    );

    expect(respuesta.status).toBe(200);
    expect(obtenerPorId).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "tenant-1",
      "org-1",
    );
    expect(crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ventas copia" }),
    );
    expect(listarFlujos).not.toHaveBeenCalled();
  });

  it("expone preflight usando Qlik y BigQuery resueltos en servidor", async () => {
    const obtenerScriptApp = vi.fn(async () => ({ script: SCRIPT }));
    const estimarConsulta = vi.fn(async () => ({
      bytesProcesados: 42,
      costoEstimadoUsd: 0.001,
    }));
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({ obtenerScriptApp }) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: {} as never,
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/dataflows/flujo-1/preflight",
    );
    const body = (await respuesta.json()) as {
      exito: boolean;
      datos: { compatible: boolean; bytesProcesados: number };
    };

    expect(respuesta.status).toBe(200);
    expect(body.exito).toBe(true);
    expect(body.datos.compatible).toBe(true);
    expect(body.datos.bytesProcesados).toBe(42);
    expect(obtenerScriptApp).toHaveBeenCalledWith("flujo-1", "current");
    expect(estimarConsulta).toHaveBeenCalledTimes(1);
  });

  it("devuelve la configuración local sin programación", async () => {
    const repo = {
      obtenerPorId: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Ventas",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Ventas DF",
        flujoEspacioIdQlik: "espacio-1",
        automatizacionIdQlik: "auto-1",
        reporteId: "reporte-1",
        automatizacionNombreSnapshot: "Ventas",
        programar: false,
        estado: "activa",
      })),
    };
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({
          obtenerScriptApp: async () => ({ script: SCRIPT }),
        }),
        resolverBigQuery: async () => ({
          estimador: {
            estimarConsulta: async () => ({
              bytesProcesados: 1,
              costoEstimadoUsd: 0,
            }),
          },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: repo,
      } as never),
    );

    const respuesta = await app.request("/api/reportes/auto-1");
    const body = (await respuesta.json()) as {
      datos?: Record<string, unknown>;
    };
    expect(respuesta.status).toBe(200);
    expect(body.datos).toMatchObject({
      nombre: "Ventas",
      flujoIdQlik: "flujo-1",
      destinoGcs: "gs://bkt_dwh/POCs/TalendDescargados/",
      activa: true,
    });
    expect(body.datos).not.toHaveProperty("programacion");
  });

  it("rechaza campos de edición que pertenecen al SQL o workspace", async () => {
    const actualizarReporte = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => ({}),
        resolverBigQuery: async () => ({
          estimador: {},
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { actualizarReporte },
      } as never),
    );

    const respuesta = await app.request("/api/reportes/auto-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ventas", gcp_script: "SELECT 1" }),
    });
    expect(respuesta.status).toBe(400);
    expect(actualizarReporte).not.toHaveBeenCalled();
  });

  it("mantiene iniciada hasta que GCS confirme y devuelve las auditorías locales", async () => {
    const marcarEstadoPorRunQlik = vi.fn(async () => undefined);
    const ejecucion = {
      id: "22222222-2222-4222-8222-222222222222",
      configuracionId: "11111111-1111-4111-8111-111111111111",
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      reporteId: "reporte-1",
      runIdQlik: "run-1",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "LOAD ...",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
      estado: "iniciada",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: new Date("2026-08-14T23:00:00Z"),
      finalizadoEn: null,
      creadoEn: new Date("2026-08-14T22:59:59Z"),
    };
    const repo = {
      obtenerPorId: vi.fn(async () => ({
        id: ejecucion.configuracionId,
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
      })),
      listarEjecuciones: vi.fn(async () => [ejecucion]),
      marcarEstadoPorRunQlik,
    };
    const qlik = {
      listarEjecuciones: vi.fn(async () => [
        { id: "run-1", status: "finished", stopTime: "2026-08-14T23:05:00Z" },
      ]),
    };
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => qlik,
        resolverBigQuery: async () => ({
          estimador: {},
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: repo,
      } as never),
    );

    const respuesta = await app.request(
      "/api/reportes/auto-1/ejecuciones-locales",
    );
    const body = (await respuesta.json()) as {
      datos?: Array<Record<string, unknown>>;
    };
    expect(respuesta.status).toBe(200);
    expect(marcarEstadoPorRunQlik).not.toHaveBeenCalled();
    expect(body.datos?.[0]).toMatchObject({
      hashDataflowSha256: "a".repeat(64),
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
    });
  });

  it("edita el nombre solo localmente y no llama a Qlik Automate", async () => {
    const actualizarAutomatizacion = vi.fn(
      async (_id: string, definicion: Record<string, unknown>) => ({
        id: "auto-1",
        name: String(definicion.name ?? "Ventas"),
        ...definicion,
      }),
    );
    const actualizarReporte = vi.fn(
      async (_id: string, cambios: Record<string, unknown>) => ({
        id: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: String(cambios.nombre ?? "Ventas"),
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Ventas DF",
        automatizacionIdQlik: "auto-1",
        reporteId: "reporte-1",
        automatizacionNombreSnapshot: String(
          cambios.automatizacionNombreSnapshot ?? "Ventas",
        ),
        programar: false,
        estado: "activa" as const,
      }),
    );
    const repo = {
      obtenerPorId: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Ventas",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Ventas DF",
        automatizacionIdQlik: "auto-1",
        reporteId: "reporte-1",
        automatizacionNombreSnapshot: "Ventas",
        programar: false,
        estado: "activa" as const,
      })),
      obtenerProgramacion: vi.fn(async () => null),
      actualizarReporte,
    };
    const qlik = {
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "auto-1",
        name: "Ventas",
        schedules: [],
        workspace: { blocks: [] },
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion,
    };
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () => qlik as never,
        resolverBigQuery: async () => ({
          estimador: {
            estimarConsulta: async () => ({
              bytesProcesados: 1,
              costoEstimadoUsd: 0,
            }),
          },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: repo as never,
      }),
    );

    const respuesta = await app.request("/api/reportes/auto-1/configuracion", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ventas Comercial v2" }),
    });

    expect(respuesta.status).toBe(200);
    expect(actualizarReporte).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        nombre: "Ventas Comercial v2",
      }),
    );
    expect(actualizarAutomatizacion).not.toHaveBeenCalled();
  });

  it("edita el Dataflow con preflight y snapshot nuevos sin actualizar Automate", async () => {
    const actualizarReporte = vi.fn(async (_id, cambios) => ({
      id: "reporte-1",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: cambios.flujoIdQlik,
      flujoNombreSnapshot: cambios.flujoNombreSnapshot,
      flujoEspacioIdQlik: cambios.flujoEspacioIdQlik,
      estado: "activa" as const,
    }));
    const preflightScript = vi.fn(async () => ({ script: SCRIPT }));
    const actualizarAutomatizacion = vi.fn();
    const repo = {
      obtenerPorId: vi.fn(async () => ({
        id: "reporte-1",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Ventas",
        flujoIdQlik: "df-1",
        flujoNombreSnapshot: "Ventas anterior",
        estado: "activa" as const,
      })),
      actualizarReporte,
    };
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () =>
          ({
            obtenerScriptApp: preflightScript,
            listarFlujos: vi.fn(async () => [
              { id: "df-2", name: "Ventas nueva", spaceId: "space-2" },
            ]),
            actualizarAutomatizacion,
          }) as never,
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
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: repo as never,
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/reporte-1/configuracion",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flujoIdQlik: "df-2" }),
      },
    );

    expect(respuesta.status).toBe(200);
    expect(preflightScript).toHaveBeenCalledWith("df-2", "current");
    expect(actualizarReporte).toHaveBeenCalledWith(
      "reporte-1",
      expect.objectContaining({
        flujoIdQlik: "df-2",
        flujoNombreSnapshot: "Ventas nueva",
        flujoEspacioIdQlik: "space-2",
      }),
    );
    expect(actualizarAutomatizacion).not.toHaveBeenCalled();
  });

  it("no persiste edición ante Dataflow incompatible", async () => {
    const actualizarReporte = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () =>
          ({
            obtenerScriptApp: vi.fn(async () => ({ script: "LET v = 1;" })),
            listarFlujos: vi.fn(),
          }) as never,
        resolverBigQuery: async () => ({
          estimador: { estimarConsulta: vi.fn() },
          projectId: "p",
          dataset: "d",
        }),
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: {
          obtenerPorId: vi.fn(async () => ({
            id: "reporte-1",
            organizacionId: "org-1",
            tenantQlikId: "tenant-1",
            creadoPorUsuarioId: "user-1",
            nombre: "Ventas",
            flujoIdQlik: "df-1",
            flujoNombreSnapshot: "Ventas anterior",
            estado: "activa" as const,
          })),
          actualizarReporte,
        } as never,
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/reporte-1/configuracion",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flujoIdQlik: "df-2" }),
      },
    );
    const body = await respuesta.json();

    expect(respuesta.status).toBe(422);
    expect(body.error.codigo).toBe("DATAFLOW_NO_COMPATIBLE");
    expect(actualizarReporte).not.toHaveBeenCalled();
  });

  it("no persiste edición ante Dataflow ausente", async () => {
    const actualizarReporte = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () =>
          ({
            obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
            listarFlujos: vi.fn(async () => []),
          }) as never,
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
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: {
          obtenerPorId: vi.fn(async () => ({
            id: "reporte-1",
            organizacionId: "org-1",
            tenantQlikId: "tenant-1",
            creadoPorUsuarioId: "user-1",
            nombre: "Ventas",
            flujoIdQlik: "df-1",
            flujoNombreSnapshot: "Ventas anterior",
            estado: "activa" as const,
          })),
          actualizarReporte,
        } as never,
      }),
    );

    const respuesta = await app.request(
      "/api/reportes/reporte-1/configuracion",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flujoIdQlik: "df-2" }),
      },
    );
    const body = await respuesta.json();

    expect(respuesta.status).toBe(404);
    expect(body.error.codigo).toBe("DATAFLOW_NO_ENCONTRADO");
    expect(actualizarReporte).not.toHaveBeenCalled();
  });

  it("mapea a DATAFLOW_NO_ENCONTRADO una creación sin Dataflow", async () => {
    const crearReporte = vi.fn();
    const app = new Hono().route(
      "/api/reportes",
      crearRutasReportesDataflow({
        resolverQlik: async () =>
          ({
            obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
            listarFlujos: vi.fn(async () => []),
          }) as never,
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
        resolverSesion: async () => ({
          tenantId: "tenant-1",
          organizacionId: "org-1",
          usuarioId: "user-1",
          usuarioIdQlik: "qlik-1",
        }),
        repositorioReportes: { crearReporte } as never,
      }),
    );
    const respuesta = await app.request("/api/reportes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ventas", flujoIdQlik: "df-1" }),
    });
    const body = await respuesta.json();
    expect(respuesta.status).toBe(404);
    expect(body.error.codigo).toBe("DATAFLOW_NO_ENCONTRADO");
    expect(crearReporte).not.toHaveBeenCalled();
  });
});

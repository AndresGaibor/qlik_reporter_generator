import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import { crearRutasReportesDataflow } from "./rutas-reportes-dataflow.js";

const SCRIPT = `
LIB CONNECT TO [Google BigQuery:Produccion];
[x]: LOAD [id];
SQL SELECT id FROM \`p.d.t\`;
`;

describe("rutas reportes Dataflow", () => {
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

  it("devuelve la configuración local y su programación", async () => {
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Ventas",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Ventas DF",
        flujoEspacioIdQlik: "espacio-1",
        destinoProveedor: "gcs",
        destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
        destinoNombreSnapshot: "TalendDescargados",
        automatizacionIdQlik: "auto-1",
        automatizacionNombreSnapshot: "Ventas",
        programar: true,
        estado: "activa",
      })),
      obtenerProgramacion: vi.fn(async () => ({
        id: "prog-1",
        configuracionId: "11111111-1111-4111-8111-111111111111",
        expresionCron: "0 8 * * *",
        zonaHoraria: "America/Guayaquil",
        proximaEjecucionEn: new Date("2026-08-15T13:00:00Z"),
        activa: true,
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
        }),
        repositorioReportes: repo,
      } as never),
    );

    const respuesta = await app.request("/api/reportes/auto-1/configuracion");
    const body = (await respuesta.json()) as {
      datos?: Record<string, unknown>;
    };
    expect(respuesta.status).toBe(200);
    expect(body.datos).toMatchObject({
      nombre: "Ventas",
      flujoIdQlik: "flujo-1",
      destinoGcs: "gs://bkt_dwh/POCs/TalendDescargados/",
      activa: true,
      programacion: expect.objectContaining({ expresionCron: "0 8 * * *" }),
    });
  });

  it("rechaza campos de edición que pertenecen al SQL o workspace", async () => {
    const actualizarConfiguracion = vi.fn();
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
        }),
        repositorioReportes: { actualizarConfiguracion },
      } as never),
    );

    const respuesta = await app.request("/api/reportes/auto-1/configuracion", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ventas", gcp_script: "SELECT 1" }),
    });
    expect(respuesta.status).toBe(400);
    expect(actualizarConfiguracion).not.toHaveBeenCalled();
  });

  it("sincroniza Qlik y devuelve las ejecuciones locales auditadas", async () => {
    const marcarEstadoPorRunQlik = vi.fn(async () => undefined);
    const ejecucion = {
      id: "22222222-2222-4222-8222-222222222222",
      configuracionId: "11111111-1111-4111-8111-111111111111",
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      runIdQlik: "run-1",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "LOAD ...",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
      tipoEjecucion: "manual",
      estado: "iniciada",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: new Date("2026-08-14T23:00:00Z"),
      finalizadoEn: null,
      creadoEn: new Date("2026-08-14T22:59:59Z"),
    };
    const repo = {
      obtenerPorAutomatizacion: vi.fn(async () => ({
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
    expect(marcarEstadoPorRunQlik).toHaveBeenCalledWith(
      "run-1",
      "completada",
      new Date("2026-08-14T23:05:00Z"),
    );
    expect(body.datos?.[0]).toMatchObject({
      hashDataflowSha256: "a".repeat(64),
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
    });
  });
});

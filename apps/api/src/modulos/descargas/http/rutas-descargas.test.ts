import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import type { PuertoJobsBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { crearRutasDescargas } from "./rutas-descargas.js";

function crearSesionHeaders(sesion: {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
}) {
  return {
    Cookie: "sesion_usuario=test-session-token",
  };
}

function crearApp(sesion: {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
}) {
  const rutas = crearRutasDescargas({
    resolverSesion: async () => sesion,
    resolverQlik: async () => ({}) as unknown as ServicioQlik,
    repositorioReportes: {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => null,
    } as unknown as PuertoRepositorioReportes,
    resolverAlmacenamiento: async () =>
      ({
        listar: async () => [],
        estaFinalizada: async () => false,
        firmar: async () => "https://signed.url",
      }) as unknown as PuertoAlmacenamientoDescargas,
    minutosFirma: 15,
  });
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return app;
}

describe("GET /api/descargas", () => {
  it("filtra la carpeta personal por usuario", async () => {
    const listarEjecucionesDescargas = vi.fn(async () => []);
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        obtenerEjecucionDescarga: async () => null,
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
          firmar: async () => "https://signed.url",
        }) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    await app.request("/api/descargas");

    expect(listarEjecucionesDescargas).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "user-1", esAdministrador: false }),
      undefined,
    );
  });

  it("retorna 200 con lista de descargas", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const app = crearApp(sesion);
    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });
    expect(respuesta.status).toBe(200);
    const json = await respuesta.json();
    expect(json.exito).toBe(true);
    expect(Array.isArray(json.datos)).toBe(true);
  });

  it("devuelve ejecuciones ordenadas por fecha", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const repo = {
      listarEjecucionesDescargas: async () => [
        {
          id: "e-1",
          flujoNombreSnapshot: "Ventas",
          automatizacionIdQlik: "auto-1",
          estado: "completada",
          mensajeError: null,
          uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
          creadoEn: new Date("2026-08-15T00:00:00Z"),
          finalizadoEn: new Date("2026-08-15T00:01:00Z"),
        },
      ],
      obtenerEjecucionDescarga: async () => null,
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: repo as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
          firmar: async () => "https://signed.url",
        }) as unknown as PuertoAlmacenamientoDescargas,
      minutosFirma: 15,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);
    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });
    expect(respuesta.status).toBe(200);
    const json = await respuesta.json();
    expect(json.datos[0].id).toBe("e-1");
    expect(json.datos[0].estado).toBe("completada");
    expect(json.datos[0].archivos).toEqual([]);
    expect(json.datos[0].reporteId).toBeUndefined();
  });

  it("sincroniza una ejecución histórica por su flujo y conserva su snapshot", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const listarEjecucionesDescargas = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "e-vieja",
          flujoIdQlik: "flujo-viejo",
          flujoNombreSnapshot: "Ventas antiguas",
          creadoPorUsuarioId: "user-1",
          automatizacionIdQlik: "auto-viejo",
          estado: "iniciada",
          mensajeError: null,
          uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-vieja/",
          creadoEn: new Date("2026-08-15T00:00:00Z"),
          finalizadoEn: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const listarEjecuciones = vi.fn(async () => []);
    const listarHistorial = vi.fn(async () => [
      {
        id: "e-vieja",
        flujoIdQlik: "flujo-viejo",
        flujoNombreSnapshot: "Ventas antiguas",
        automatizacionIdQlik: "auto-viejo",
        estado: "iniciada" as const,
        runIdQlik: "run-viejo",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        hashDataflowSha256: "hash",
        scriptDataflow: "script",
        sqlBigQueryCompilado: "sql",
        scriptExportacion: "export",
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-vieja/",
        creadoEn: new Date(),
      },
    ]);
    const resolverQlik = vi.fn(
      async () => ({ listarEjecuciones }) as unknown as ServicioQlik,
    );
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        listarEjecuciones: listarHistorial,
        obtenerEjecucionDescarga: async () => null,
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
        }) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas", {
      headers: crearSesionHeaders(sesion),
    });

    expect(respuesta.status).toBe(200);
    expect(resolverQlik).toHaveBeenCalledTimes(1);
    expect(listarEjecucionesDescargas).toHaveBeenCalledTimes(2);
    expect(listarHistorial).toHaveBeenCalledWith(
      "flujo-viejo",
      "tenant-1",
      "org-1",
      100,
    );
    expect(listarEjecuciones).toHaveBeenCalledWith("auto-viejo", {
      limit: 100,
      sort: "desc",
    });
  });
});

describe("PUT /api/descargas/:id/compartido", () => {
  it("guarda destinatarios de la misma organización", async () => {
    const usuarioId = "11111111-1111-4111-8111-111111111111";
    const destinatarioId = "22222222-2222-4222-8222-222222222222";
    const guardarCompartidoDescarga = vi.fn(async () => undefined);
    const rutas = crearRutasDescargas({
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        organizacionId: "org-1",
        usuarioId,
      }),
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: {
        obtenerEjecucionPorId: async () => ({
          id: "33333333-3333-4333-8333-333333333333",
          tenantQlikId: "tenant-1",
          organizacionId: "org-1",
          ejecutadoPorUsuarioId: usuarioId,
        }),
        guardarCompartidoDescarga,
      } as unknown as PuertoRepositorioReportes,
      resolverUsuariosOrganizacion: async () => [
        { id: usuarioId, nombre: "Origen", correo: "origen@example.com" },
        {
          id: destinatarioId,
          nombre: "Destino",
          correo: "destino@example.com",
        },
      ],
      resolverAlmacenamiento: async () =>
        ({}) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono().route("/api/descargas", rutas);

    const respuesta = await app.request(
      "/api/descargas/33333333-3333-4333-8333-333333333333/compartido",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          todaOrganizacion: false,
          usuarios: [destinatarioId],
        }),
      },
    );

    expect(respuesta.status).toBe(200);
    expect(guardarCompartidoDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ usuarios: [destinatarioId] }),
    );
  });
});

// BigQuery sync tests moved to rutas-descargas-bigquery.test.ts

describe("GET /api/descargas/administracion", () => {
  it("bloquea a usuarios finales", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const app = crearApp(sesion);
    const respuesta = await app.request("/api/descargas/administracion");
    expect(respuesta.status).toBe(403);
  });

  it("permite a admin consultar toda la organizacion", async () => {
    const listarEjecucionesDescargas = vi.fn(async () => []);
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "admin-1",
      roles: ["admin" as const],
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        obtenerEjecucionDescarga: async () => null,
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
          firmar: async () => "https://signed.url",
        }) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas/administracion");

    expect(respuesta.status).toBe(200);
    expect(listarEjecucionesDescargas).toHaveBeenCalledWith(
      expect.objectContaining({ esAdministrador: true }),
      undefined,
    );
  });
});

describe("POST /api/descargas/:id/manifiesto", () => {
  it("retorna 200 para ejecución completada con archivos", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const repo = {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => ({
        id: "e-1",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
        creadoEn: new Date(),
        finalizadoEn: new Date(),
      }),
    };
    const alm = {
      estaFinalizada: async () => true,
      listar: async () => [
        {
          nombre: "parte-001-000000000000.csv.gz",
          rutaCompleta:
            "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz",
          tamanoBytes: 1024,
        },
      ],
      firmar: async () => "https://storage.example.com/signed",
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: repo as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        alm as unknown as PuertoAlmacenamientoDescargas,
      minutosFirma: 15,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);
    const respuesta = await app.request("/api/descargas/e-1/manifiesto", {
      method: "POST",
      headers: crearSesionHeaders(sesion),
    });
    expect(respuesta.status).toBe(200);
    const json = await respuesta.json();
    expect(json.exito).toBe(true);
    expect(json.datos.descargaId).toBe("e-1");
    expect(Array.isArray(json.datos.archivos)).toBe(true);
  });

  it("retorna 404 para ejecución ajena (otro tenant)", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const repo = {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => null,
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: repo as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
          firmar: async () => "",
        }) as unknown as PuertoAlmacenamientoDescargas,
      minutosFirma: 15,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);
    const respuesta = await app.request("/api/descargas/e-ajena/manifiesto", {
      method: "POST",
      headers: crearSesionHeaders(sesion),
    });
    expect(respuesta.status).toBe(404);
    const json = await respuesta.json();
    expect(json.exito).toBe(false);
    expect(json.error.codigo).toBe("EJECUCION_NO_ENCONTRADA");
  });

  it("retorna 409 para ejecución en curso (no completada)", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const repo = {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => ({
        id: "e-iniciada",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "iniciada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-iniciada/",
        creadoEn: new Date(),
        finalizadoEn: null,
      }),
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: repo as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [],
          estaFinalizada: async () => false,
          firmar: async () => "",
        }) as unknown as PuertoAlmacenamientoDescargas,
      minutosFirma: 15,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);
    const respuesta = await app.request(
      "/api/descargas/e-iniciada/manifiesto",
      {
        method: "POST",
        headers: crearSesionHeaders(sesion),
      },
    );
    expect(respuesta.status).toBe(409);
    const json = await respuesta.json();
    expect(json.exito).toBe(false);
    expect(json.error.codigo).toBe("EJECUCION_NO_COMPLETADA");
  });

  it("retorna 410 para ejecución sin archivos en GCS", async () => {
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    };
    const repo = {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => ({
        id: "e-vacia",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-vacia/",
        creadoEn: new Date(),
        finalizadoEn: new Date(),
      }),
    };
    const alm = {
      listar: async () => [],
      estaFinalizada: async () => false,
      firmar: async () => "",
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: repo as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        alm as unknown as PuertoAlmacenamientoDescargas,
      minutosFirma: 15,
    });
    const app = new Hono();
    app.route("/api/descargas", rutas);
    const respuesta = await app.request("/api/descargas/e-vacia/manifiesto", {
      method: "POST",
      headers: crearSesionHeaders(sesion),
    });
    expect(respuesta.status).toBe(410);
    const json = await respuesta.json();
    expect(json.exito).toBe(false);
    expect(json.error.codigo).toBe("ARCHIVOS_NO_DISPONIBLES");
  });
});

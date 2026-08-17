import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
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
        firmar: async () => "https://signed.url",
      }) as unknown as PuertoAlmacenamientoDescargas,
    minutosFirma: 15,
  });
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return app;
}

describe("GET /api/descargas", () => {
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
          reporteNombre: "Ventas",
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
        reporteNombre: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
        creadoEn: new Date(),
        finalizadoEn: new Date(),
      }),
    };
    const alm = {
      listar: async () => [
        {
          nombre: "reporte.csv",
          rutaCompleta: "POCs/TalendDescargados/ventas/e-1/reporte.csv",
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
        reporteNombre: "Ventas",
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
        reporteNombre: "Ventas",
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

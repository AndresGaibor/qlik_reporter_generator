import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { crearRutasDescargas } from "./rutas-descargas.js";

function crearApp(rol: "admin" | "usuario") {
  const almacenamiento = {
    listarDirectorio: async () => ({
      carpetas: ["byronnasimba/", "reportes/"],
      archivos: [
        {
          nombre: "mini-test-000000000000.csv.gz",
          rutaCompleta: "POCs/TalendDescargados/mini-test-000000000000.csv.gz",
          tamanoBytes: 120,
          formato: "CSV.GZ",
          fecha: "2026-08-18T15:00:00.000Z",
        },
      ],
    }),
    listar: async () => [],
    estaFinalizada: async () => false,
    firmar: async () => "https://storage.example.com/signed",
  } as unknown as PuertoAlmacenamientoDescargas;
  const rutas = crearRutasDescargas({
    resolverSesion: async () => ({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      correo: "byron.nasimba@aliwareint.com",
      roles: [rol],
      esSuperadmin: false,
    }),
    resolverQlik: async () => ({}) as unknown as ServicioQlik,
    repositorioReportes: {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => null,
    } as unknown as PuertoRepositorioReportes,
    resolverAlmacenamiento: async () => almacenamiento,
    resolverConfiguracionGcs: async () => ({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/",
    }),
    minutosFirma: 15,
  });
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return app;
}

describe("explorador GCS administrativo", () => {
  it("lista carpetas y archivos del prefijo configurado para admin", async () => {
    const res = await crearApp("admin").request("/api/descargas/explorador");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.datos.bucket).toBe("bkt_dwh");
    expect(json.datos.carpetas).toEqual(["reportes/"]);
    expect(json.datos.archivos[0].nombre).toBe("mini-test-000000000000.csv.gz");
  });

  it("rechaza el explorador para usuario final", async () => {
    const res = await crearApp("usuario").request("/api/descargas/explorador");
    expect(res.status).toBe(403);
  });

  it("rechaza firmar objetos fuera del prefijo configurado", async () => {
    const res = await crearApp("admin").request(
      "/api/descargas/explorador/firma",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruta: "otra-carpeta/secreto.csv" }),
      },
    );
    expect(res.status).toBe(422);
  });
});

it("rechaza traversal aunque la ruta empiece con el prefijo permitido", async () => {
  const res = await crearApp("admin").request(
    "/api/descargas/explorador/firma",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ruta: "POCs/TalendDescargados/../secreto.csv",
      }),
    },
  );
  expect(res.status).toBe(422);
});

function crearAppCarpetas(rol: "admin" | "usuario") {
  const prefijos: string[] = [];
  const almacenamiento = {
    listarDirectorio: async (prefijo: string) => {
      prefijos.push(prefijo);
      if (prefijo === "POCs/TalendDescargados/") {
        return {
          carpetas: [
            "andresgaibor/",
            "byronnasimba/",
            "byron.nasimba/",
            "reportes/",
          ],
          archivos: [],
        };
      }
      return {
        carpetas: [],
        archivos: [
          {
            nombre: "pruebagcp.csv",
            rutaCompleta: `${prefijo}pruebagcp.csv`,
            tamanoBytes: 27,
            formato: "CSV" as const,
            fecha: "2026-08-18T22:34:00.000Z",
          },
        ],
      };
    },
    listar: async () => [],
    estaFinalizada: async () => false,
    firmar: async () => "https://storage.example.com/signed",
  } as unknown as PuertoAlmacenamientoDescargas;
  const rutas = crearRutasDescargas({
    resolverSesion: async () => ({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      correo: "byron.nasimba@aliwareint.com",
      roles: [rol],
    }),
    resolverQlik: async () => ({}) as unknown as ServicioQlik,
    repositorioReportes: {
      listarEjecucionesDescargas: async () => [],
      obtenerEjecucionDescarga: async () => null,
    } as unknown as PuertoRepositorioReportes,
    resolverAlmacenamiento: async () => almacenamiento,
    resolverConfiguracionGcs: async () => ({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/",
    }),
    resolverUsuariosOrganizacion: async () => [
      { id: "user-1", correo: "byron.nasimba@aliwareint.com" },
      { id: "user-2", correo: "andres.gaibor@aliwareint.com" },
      { id: "user-3", correo: null },
    ],
  } satisfies Parameters<typeof crearRutasDescargas>[0]);
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return { app, prefijos };
}

describe("carpetas GCS por usuario registrado", () => {
  it("usuario final consulta solo byronnasimba derivado de su correo", async () => {
    const { app, prefijos } = crearAppCarpetas("usuario");
    const res = await app.request("/api/descargas/carpeta");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.datos.carpetaUsuario).toBe("byronnasimba");
    expect(json.datos.archivos[0].nombre).toBe("pruebagcp.csv");
    expect(prefijos).toEqual(["POCs/TalendDescargados/byronnasimba/"]);
  });

  it("admin lista solo carpetas GCS equivalentes a usuarios registrados", async () => {
    const { app } = crearAppCarpetas("admin");
    const res = await app.request("/api/descargas/administracion/carpetas");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.datos.map((item: { carpeta: string }) => item.carpeta)).toEqual(
      ["andresgaibor"],
    );
  });
});

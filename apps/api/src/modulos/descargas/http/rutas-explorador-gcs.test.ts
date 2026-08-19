import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { crearRutasDescargas } from "./rutas-descargas.js";

function crearApp(rol: "admin" | "usuario") {
  const almacenamiento = {
    listarDirectorio: async () => ({
      carpetas: ["reportes/"],
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

import { Readable } from "node:stream";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas";
import { crearRutasDescargas } from "./rutas-descargas";

function crearApp() {
  const almacenamiento = {
    listarDirectorio: async () => ({
      carpetas: [],
      archivos: [
        {
          nombre: "parte-000.csv.gz",
          rutaCompleta:
            "POCs/TalendDescargados/byronnasimba/test/parte-000.csv.gz",
          tamanoBytes: 3,
        },
        {
          nombre: "parte-001.csv.gz",
          rutaCompleta:
            "POCs/TalendDescargados/byronnasimba/test/parte-001.csv.gz",
          tamanoBytes: 3,
        },
      ],
    }),
    abrirLectura: (ruta: string) =>
      Readable.from([ruta.endsWith("000.csv.gz") ? "uno" : "dos"]),
    listar: async () => [],
    estaFinalizada: async () => false,
    firmar: async () => "",
  } as unknown as PuertoAlmacenamientoDescargas;
  const rutas = crearRutasDescargas({
    resolverSesion: async () => ({
      tenantId: "t",
      organizacionId: "o",
      usuarioId: "u",
      correo: "byron.nasimba@aliwareint.com",
      roles: ["usuario"],
    }),
    resolverQlik: async () => ({}) as never,
    repositorioReportes: {} as never,
    resolverAlmacenamiento: async () => almacenamiento,
    resolverConfiguracionGcs: async () => ({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/",
    }),
  });
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return app;
}

describe("ZIP de carpeta privada", () => {
  it("descarga los archivos visibles de la carpeta actual en un ZIP", async () => {
    const res = await crearApp().request(
      "/api/descargas/carpeta/zip?ruta=test%2F",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toContain("test.zip");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    const texto = new TextDecoder().decode(bytes);
    expect(texto).toContain("parte-000.csv.gz");
    expect(texto).toContain("parte-001.csv.gz");
  });
});

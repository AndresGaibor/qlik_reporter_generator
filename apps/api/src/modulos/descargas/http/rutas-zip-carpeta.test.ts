import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas";
import { crearRutasDescargas } from "./rutas-descargas";

const PREFIJO = "POCs/TalendDescargados/byronnasimba/test/";

function crearAlmacenamientoMemoria() {
  const objetos = new Map<string, Buffer>([
    [
      `${PREFIJO}parte-000.csv.gz`,
      gzipSync(Buffer.from("id|texto\n1|uno\n2|dos\n3|tres\n")),
    ],
  ]);
  let lecturas = 0;
  const almacenamiento = {
    listarDirectorio: async (prefijo: string) => ({
      carpetas: [],
      archivos: [...objetos.entries()]
        .filter(([ruta]) => ruta.startsWith(prefijo))
        .filter(([ruta]) => !ruta.slice(prefijo.length).includes("/"))
        .filter(([ruta]) => /\.csv(?:\.gz)?$/i.test(ruta))
        .map(([ruta, contenido]) => ({
          nombre: ruta.split("/").at(-1) ?? ruta,
          rutaCompleta: ruta,
          tamanoBytes: contenido.length,
          formato: ruta.endsWith(".gz")
            ? ("CSV.GZ" as const)
            : ("CSV" as const),
        })),
    }),
    listar: async () => [],
    estaFinalizada: async () => true,
    abrirLectura: (ruta: string) => {
      lecturas += 1;
      return Readable.from([objetos.get(ruta) ?? Buffer.alloc(0)]);
    },
    firmar: async () => "",
  } satisfies PuertoAlmacenamientoDescargas;
  return { almacenamiento, getLecturas: () => lecturas };
}

function crearApp() {
  const memoria = crearAlmacenamientoMemoria();
  const rutas = crearRutasDescargas({
    resolverSesion: async () => ({
      tenantId: "t",
      organizacionId: "o",
      usuarioId: "u",
      correo: "byron.nasimba@aliwareint.com",
      roles: ["usuario"],
    }),
    resolverQlik: async () => ({}) as never,
    repositorioReportes: {
      listarEjecucionesDescargas: async () => [],
    } as never,
    resolverAlmacenamiento: async () => memoria.almacenamiento,
    resolverConfiguracionGcs: async () => ({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/",
      maximoFilasPorArchivo: 2,
    }),
  });
  const app = new Hono();
  app.route("/api/descargas", rutas);
  return { app, ...memoria };
}

describe("exploración privada sin procesamiento pesado", () => {
  it("lista el GZIP como CSV descargable sin leer su contenido", async () => {
    const { app, getLecturas } = crearApp();
    const res = await app.request("/api/descargas/carpeta?ruta=test%2F");
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.datos.archivos).toEqual([
      expect.objectContaining({ nombre: "parte-000.csv", formato: "CSV" }),
    ]);
    expect(getLecturas()).toBe(0);
  });

  it("descarga un archivo fuente como CSV sin compresión", async () => {
    const { app } = crearApp();
    const res = await app.request(
      "/api/descargas/carpeta/csv?ruta=test%2F&archivo=parte-000.csv",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("parte-000.csv");
    expect(await res.text()).toBe("id|texto\n1|uno\n2|dos\n3|tres\n");
  });
});

describe("ZIP de carpeta privada", () => {
  it("reparte en streaming y entrega CSV sin crear cache en GCS", async () => {
    const { app } = crearApp();
    const res = await app.request("/api/descargas/carpeta/zip?ruta=test%2F");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    const texto = new TextDecoder().decode(bytes);
    expect(texto).toContain("parte-001.csv");
    expect(texto).toContain("parte-002.csv");
    expect(texto).not.toContain("parte-000.csv.gz");
    expect(texto).toContain("id|texto\n1|uno\n2|dos\n");
    expect(texto).toContain("id|texto\n3|tres\n");
  });
});

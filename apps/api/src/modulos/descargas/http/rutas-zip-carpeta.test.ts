import { Readable, Writable } from "node:stream";
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
  const lecturasPorRuta = new Map<string, number>();
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
    listar: async (prefijo: string) =>
      [...objetos.entries()]
        .filter(([ruta]) => ruta.startsWith(prefijo))
        .map(([ruta, contenido]) => ({
          nombre: ruta.split("/").at(-1) ?? ruta,
          rutaCompleta: ruta,
          tamanoBytes: contenido.length,
          formato: "CSV.GZ" as const,
        })),
    estaFinalizada: async () => true,
    abrirLectura: (ruta: string) => {
      lecturas += 1;
      lecturasPorRuta.set(ruta, (lecturasPorRuta.get(ruta) ?? 0) + 1);
      return Readable.from([objetos.get(ruta) ?? Buffer.alloc(0)]);
    },
    abrirEscritura: (ruta: string) => {
      const fragmentos: Buffer[] = [];
      return new Writable({
        write(fragmento, _codificacion, terminar) {
          fragmentos.push(Buffer.from(fragmento));
          terminar();
        },
        final(terminar) {
          objetos.set(ruta, Buffer.concat(fragmentos));
          terminar();
        },
      });
    },
    firmar: async () => "",
  } satisfies PuertoAlmacenamientoDescargas;
  return {
    almacenamiento,
    agregarObjeto: (ruta: string, contenido: string) =>
      objetos.set(ruta, Buffer.from(contenido)),
    getLecturas: () => lecturas,
    getLecturasRuta: (ruta: string) => lecturasPorRuta.get(ruta) ?? 0,
  };
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
      obtenerEjecucionDescarga: async () => ({
        id: "test",
        estado: "completada",
        uriBaseGcs: `gs://bkt_dwh/${PREFIJO}`,
        flujoNombreSnapshot: "Ventas",
      }),
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

  it("lista y descarga cada parte normalizada", async () => {
    const { app } = crearApp();
    const preparacion = await app.request("/api/descargas/test/partes");
    expect(preparacion.status).toBe(202);
    expect((await preparacion.json()).datos.estado).toBe("preparando");
    let datos: { estado: string; partes: unknown[] } = {
      estado: "preparando",
      partes: [],
    };
    for (let intento = 0; intento < 20 && datos.estado !== "lista"; intento++) {
      await new Promise((resolver) => setTimeout(resolver, 5));
      const catalogo = await app.request("/api/descargas/test/partes");
      datos = (await catalogo.json()).datos;
    }
    expect(datos.partes).toEqual([
      {
        numero: 1,
        nombre: "parte-001.csv",
        tamano: 21,
        url: "/api/descargas/test/partes/1",
      },
      {
        numero: 2,
        nombre: "parte-002.csv",
        tamano: 16,
        url: "/api/descargas/test/partes/2",
      },
    ]);

    const primera = await app.request("/api/descargas/test/partes/1");
    const segunda = await app.request("/api/descargas/test/partes/2");
    expect(await primera.text()).toBe("id|texto\n1|uno\n2|dos\n");
    expect(await segunda.text()).toBe("id|texto\n3|tres\n");
  });

  it("publica las partes terminadas mientras prepara las restantes", async () => {
    const { app, agregarObjeto } = crearApp();
    agregarObjeto(
      `${PREFIJO}__download_cache__/parte-001.csv`,
      "id|texto\n1|uno\n2|dos\n",
    );

    const respuesta = await app.request("/api/descargas/test/partes");
    expect(respuesta.status).toBe(202);
    expect((await respuesta.json()).datos).toEqual({
      estado: "preparando",
      partes: [
        {
          numero: 1,
          nombre: "parte-001.csv",
          tamano: 21,
          url: "/api/descargas/test/partes/1",
        },
      ],
    });
  });
});

describe("ZIP de ejecución compartida", () => {
  it("une los shards y respeta el máximo configurado", async () => {
    const { app } = crearApp();
    const res = await app.request("/api/descargas/test/zip");
    expect(res.status).toBe(200);
    const texto = new TextDecoder().decode(await res.arrayBuffer());
    expect(texto).toContain("parte-001.csv");
    expect(texto).toContain("parte-002.csv");
    expect(texto).not.toContain("parte-000.csv.gz");
    expect(texto).toContain("id|texto\n1|uno\n2|dos\n");
    expect(texto).toContain("id|texto\n3|tres\n");
  });

  it("reutiliza las partes preparadas sin volver a leer el GZIP fuente", async () => {
    const { app, getLecturasRuta } = crearApp();
    let estado = "preparando";
    await app.request("/api/descargas/test/partes");
    for (let intento = 0; intento < 20 && estado !== "lista"; intento++) {
      await new Promise((resolver) => setTimeout(resolver, 5));
      const catalogo = await app.request("/api/descargas/test/partes");
      estado = (await catalogo.json()).datos.estado;
    }
    const lecturasFuente = getLecturasRuta(`${PREFIJO}parte-000.csv.gz`);

    const res = await app.request("/api/descargas/test/zip");
    expect(res.status).toBe(200);
    await res.arrayBuffer();

    expect(getLecturasRuta(`${PREFIJO}parte-000.csv.gz`)).toBe(lecturasFuente);
    expect(getLecturasRuta(`${PREFIJO}__download_cache__/parte-001.csv`)).toBe(
      1,
    );
    expect(getLecturasRuta(`${PREFIJO}__download_cache__/parte-002.csv`)).toBe(
      1,
    );
  });
});

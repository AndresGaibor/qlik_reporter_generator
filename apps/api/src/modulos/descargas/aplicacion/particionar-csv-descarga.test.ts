import { describe, expect, it } from "bun:test";
import { Readable, Writable } from "node:stream";
import { gzipSync } from "node:zlib";
import { particionarCsvDescarga } from "./particionar-csv-descarga.js";
import type {
  ArchivoGcs,
  PuertoAlmacenamientoDescargas,
} from "./puerto-almacenamiento-descargas.js";

describe("particionado CSV en streaming", () => {
  it("reparte varias fuentes sin cache GCS y conserva registros multilinea", async () => {
    const contenidos = new Map<string, Buffer>([
      [
        "reportes/a.csv.gz",
        gzipSync(Buffer.from('id|texto\n1|"hola\nmundo"\n2|dos\n')),
      ],
      ["reportes/b.csv.gz", gzipSync(Buffer.from("id|texto\n3|tres\n"))],
    ]);
    const fuentes: ArchivoGcs[] = [...contenidos.entries()].map(
      ([ruta, contenido]) => ({
        nombre: ruta.split("/").at(-1) ?? ruta,
        rutaCompleta: ruta,
        tamanoBytes: contenido.length,
        formato: "CSV.GZ",
      }),
    );
    const salidas = new Map<string, Buffer[]>();
    const almacenamiento = {
      abrirLectura: (ruta: string) =>
        Readable.from([contenidos.get(ruta) ?? Buffer.alloc(0)]),
      listar: async () => [],
      estaFinalizada: async () => false,
      firmar: async () => "",
    } as PuertoAlmacenamientoDescargas;

    const nombres = await particionarCsvDescarga(
      almacenamiento,
      fuentes,
      2,
      (nombre) => {
        const chunks: Buffer[] = [];
        salidas.set(nombre, chunks);
        return new Writable({
          write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
          },
        });
      },
    );

    expect(nombres).toEqual(["parte-001.csv", "parte-002.csv"]);
    expect(Buffer.concat(salidas.get("parte-001.csv") ?? []).toString()).toBe(
      'id|texto\n1|"hola\nmundo"\n2|dos\n',
    );
    expect(Buffer.concat(salidas.get("parte-002.csv") ?? []).toString()).toBe(
      "id|texto\n3|tres\n",
    );
    expect(salidas.get("parte-001.csv")).toHaveLength(2);
    expect(salidas.get("parte-002.csv")).toHaveLength(2);
  });

  it("rechaza cabeceras distintas entre archivos fuente", async () => {
    const contenidos = new Map<string, Buffer>([
      ["reportes/a.csv", Buffer.from("id|texto\n1|uno\n")],
      ["reportes/b.csv", Buffer.from("id|otro\n2|dos\n")],
    ]);
    const fuentes: ArchivoGcs[] = [...contenidos.entries()].map(
      ([ruta, contenido]) => ({
        nombre: ruta.split("/").at(-1) ?? ruta,
        rutaCompleta: ruta,
        tamanoBytes: contenido.length,
        formato: "CSV",
      }),
    );
    const almacenamiento = {
      abrirLectura: (ruta: string) =>
        Readable.from([contenidos.get(ruta) ?? Buffer.alloc(0)]),
      listar: async () => [],
      estaFinalizada: async () => false,
      firmar: async () => "",
    } as PuertoAlmacenamientoDescargas;

    let codigo: string | undefined;
    try {
      await particionarCsvDescarga(
        almacenamiento,
        fuentes,
        10,
        () =>
          new Writable({
            write(_chunk, _encoding, cb) {
              cb();
            },
          }),
      );
    } catch (error) {
      codigo = (error as { codigo?: string }).codigo;
    }
    expect(codigo).toBe("CSV_CABECERAS_INCOMPATIBLES");
  });
});

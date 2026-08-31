import { describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";
import ExcelJS from "exceljs";
import { generarXlsxDescarga } from "./generar-xlsx-descarga.js";
import type { PuertoAlmacenamientoDescargas } from "./puerto-almacenamiento-descargas.js";

describe("generarXlsxDescarga", () => {
  it("convierte CSV en un libro de una sola hoja", async () => {
    const salida: Buffer[] = [];
    const almacenamiento = {
      abrirLectura: () =>
        Readable.from([Buffer.from('id|texto\n1|uno\n2|"dos|valor"\n')]),
      listar: async () => [],
      estaFinalizada: async () => false,
      firmar: async () => "",
    } as PuertoAlmacenamientoDescargas;

    const nombres = await generarXlsxDescarga(
      almacenamiento,
      [
        {
          nombre: "ventas.csv",
          rutaCompleta: "ventas.csv",
          tamanoBytes: 30,
          formato: "CSV",
        },
      ],
      () =>
        new Writable({
          write(chunk, _encoding, callback) {
            salida.push(Buffer.from(chunk));
            callback();
          },
        }),
    );

    expect(nombres).toEqual(["parte-001.xlsx"]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(
      Buffer.concat(salida) as unknown as Parameters<typeof libro.xlsx.load>[0],
    );
    expect(libro.worksheets).toHaveLength(1);
    expect(libro.worksheets[0]?.getRow(2).values).toEqual([
      undefined,
      "1",
      "uno",
    ]);
    expect(libro.worksheets[0]?.getRow(3).values).toEqual([
      undefined,
      "2",
      "dos|valor",
    ]);
  });
});

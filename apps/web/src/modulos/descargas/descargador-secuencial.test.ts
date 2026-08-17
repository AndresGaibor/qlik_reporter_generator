import type { ArchivoDescarga } from "@qlik/contratos/descargas";
import { describe, expect, it, vi } from "vitest";
import {
  type CarpetaDestino,
  type ProgresoDescargaArchivo,
  descargarArchivosSecuencialmente,
} from "./descargador-secuencial";

function archivo(nombre: string, tamano: number): ArchivoDescarga {
  return { nombre, tamano, url: `https://storage.test/${nombre}` };
}

function respuestaPorChunks(chunks: number[][]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe("descargarArchivosSecuencialmente", () => {
  it("escribe cada archivo por chunks sin materializar un Blob completo", async () => {
    const escrituras: Uint8Array[] = [];
    const cerrar = vi.fn(async () => undefined);
    const carpeta: CarpetaDestino = {
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({
          write: async (datos: BufferSource | Blob | string) => {
            expect(datos).toBeInstanceOf(Uint8Array);
            escrituras.push(datos as Uint8Array);
          },
          close: cerrar,
          abort: vi.fn(async () => undefined),
        }),
      })),
    };
    const fetcher = vi.fn(async () =>
      respuestaPorChunks([
        [1, 2],
        [3, 4, 5],
      ]),
    );
    const progresos: Array<{ porcentaje: number; bytesDescargados: number }> =
      [];

    await descargarArchivosSecuencialmente({
      archivos: [archivo("parte-001.csv.gz", 5)],
      carpeta,
      fetcher,
      senal: new AbortController().signal,
      onProgreso: (p) => progresos.push(p),
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(escrituras.map((chunk) => [...chunk])).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
    expect(cerrar).toHaveBeenCalledOnce();
    expect(progresos.at(-1)).toMatchObject({
      porcentaje: 100,
      bytesDescargados: 5,
    });
  });

  it("mantiene progreso acumulado por bytes entre varios archivos", async () => {
    const carpeta: CarpetaDestino = {
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({
          write: async () => undefined,
          close: async () => undefined,
          abort: async () => undefined,
        }),
      })),
    };
    const respuestas = [
      respuestaPorChunks([[1, 2, 3]]),
      respuestaPorChunks([[4, 5]]),
    ];
    const progresos: ProgresoDescargaArchivo[] = [];

    await descargarArchivosSecuencialmente({
      archivos: [
        archivo("parte-001.csv.gz", 3),
        archivo("parte-002.csv.gz", 2),
      ],
      carpeta,
      fetcher: vi.fn(
        async () => respuestas.shift() ?? new Response(null, { status: 500 }),
      ),
      senal: new AbortController().signal,
      onProgreso: (p) => progresos.push(p),
    });

    expect(progresos.at(-1)).toMatchObject({
      porcentaje: 100,
      indice: 2,
      total: 2,
      bytesDescargados: 5,
      totalBytes: 5,
    });
  });
});

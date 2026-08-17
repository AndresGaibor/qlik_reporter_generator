import type { ManifiestoDescarga } from "@qlik/contratos/descargas";
import { describe, expect, it, vi } from "vitest";
import { descargarEnSecuencia } from "./descargador-secuencial";

const crearManifiesto = (
  archivos: Array<{ nombre: string }>,
): ManifiestoDescarga => ({
  descargaId: "descarga-1",
  archivos: archivos.map((a) => ({
    nombre: a.nombre,
    url: `https://example.com/${a.nombre}`,
    tamano: 1024,
  })),
});

describe("descargador-secuencial", () => {
  it("descarga archivos en secuencia", async () => {
    const manifiesto = crearManifiesto([
      { nombre: "archivo1.csv" },
      { nombre: "archivo2.csv" },
    ]);
    const senal = new AbortController().signal;
    const onProgreso = vi.fn();

    await descargarEnSecuencia(manifiesto, { senal, onProgreso });

    expect(onProgreso).toHaveBeenCalledTimes(2);
    expect(onProgreso).toHaveBeenNthCalledWith(1, 1, 2, "archivo1.csv");
    expect(onProgreso).toHaveBeenNthCalledWith(2, 2, 2, "archivo2.csv");
  });

  it("devuelve resultado con contadores correctos", async () => {
    const manifiesto = crearManifiesto([{ nombre: "archivo1.csv" }]);
    const senal = new AbortController().signal;

    const resultado = await descargarEnSecuencia(manifiesto, { senal });

    expect(resultado.exitosas).toBeGreaterThanOrEqual(0);
    expect(resultado.fallidas).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(resultado.archivosProcesados)).toBe(true);
  });

  it("llama a onArchivoDescargado por cada archivo", async () => {
    const manifiesto = crearManifiesto([
      { nombre: "a.csv" },
      { nombre: "b.csv" },
    ]);
    const senal = new AbortController().signal;
    const onArchivoDescargado = vi.fn();

    await descargarEnSecuencia(manifiesto, { senal, onArchivoDescargado });

    expect(onArchivoDescargado).toHaveBeenCalledTimes(2);
  });
});

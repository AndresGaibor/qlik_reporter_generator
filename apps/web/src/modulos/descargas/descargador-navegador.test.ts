import type { ArchivoDescarga } from "@qlik/contratos/descargas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarDescargasNavegador } from "./descargador-navegador";

const archivos: ArchivoDescarga[] = [
  { nombre: "parte-001.csv.gz", tamano: 10, url: "https://storage/1" },
  { nombre: "parte-002.csv.gz", tamano: 20, url: "https://storage/2" },
];

afterEach(() => vi.restoreAllMocks());

describe("iniciarDescargasNavegador", () => {
  it("dispara un anchor por archivo sin solicitar carpeta", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const picker = vi.fn();
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: picker,
    });

    await iniciarDescargasNavegador(archivos, { pausaMs: 0 });

    expect(click).toHaveBeenCalledTimes(2);
    expect(picker).not.toHaveBeenCalled();
  });
});

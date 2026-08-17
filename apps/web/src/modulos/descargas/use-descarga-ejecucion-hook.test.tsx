import { act } from "react";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UseDescargaEjecucionReturn,
  useDescargaEjecucion,
} from "./use-descarga-ejecucion";

const mocks = vi.hoisted(() => ({
  solicitarManifiesto: vi.fn(),
}));

vi.mock("./api", () => ({
  solicitarManifiesto: mocks.solicitarManifiesto,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let ultimoHook: UseDescargaEjecucionReturn | undefined;

function Harness() {
  ultimoHook = useDescargaEjecucion();
  return null;
}

beforeEach(() => {
  mocks.solicitarManifiesto.mockReset();
  ultimoHook = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<Harness />));
});

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

describe("useDescargaEjecucion", () => {
  it("elige la carpeta una sola vez y antes de solicitar el manifiesto", async () => {
    const orden: string[] = [];
    const writable = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const carpeta = {
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => writable,
      })),
    };
    const picker = vi.fn(async () => {
      orden.push("picker");
      return carpeta;
    });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: picker,
    });
    mocks.solicitarManifiesto.mockImplementation(async () => {
      orden.push("manifest");
      return {
        descargaId: "11111111-1111-4111-8111-111111111111",
        archivos: [
          { nombre: "parte-001.csv.gz", tamano: 2, url: "https://storage/1" },
          { nombre: "parte-002.csv.gz", tamano: 2, url: "https://storage/2" },
        ],
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(Uint8Array.from([1, 2]));
                controller.close();
              },
            }),
            { status: 200 },
          ),
      ),
    );

    await act(async () => {
      await ultimoHook?.iniciarDescarga("ejecucion-1");
    });

    expect(picker).toHaveBeenCalledOnce();
    expect(orden.slice(0, 2)).toEqual(["picker", "manifest"]);
    expect(carpeta.getFileHandle).toHaveBeenCalledTimes(2);
    expect(ultimoHook?.estado.estado).toBe("completada");
  });
});

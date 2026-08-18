import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DescargaEjecucion } from "./descarga-ejecucion";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("DescargaEjecucion", () => {
  it("usa porcentaje y bytes reales para la barra de progreso", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <DescargaEjecucion
          estado="descargando"
          progreso={1}
          totalArchivos={2}
          archivoActual="parte-001.csv.gz"
          porcentaje={37}
          bytesDescargados={37}
          totalBytes={100}
          error={null}
          onDescargar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );
    });

    expect(container?.textContent).toContain("1 / 2");
    expect(container?.textContent).toContain("37 B / 100 B");
    const barra = container?.querySelector<HTMLElement>(
      "[data-progreso-descarga]",
    );
    expect(barra?.style.width).toBe("37%");
  });
});

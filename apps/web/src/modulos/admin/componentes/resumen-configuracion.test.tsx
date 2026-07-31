import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ResumenConfiguracion } from "./resumen-configuracion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

test("muestra progreso y accesos a cada sección", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResumenConfiguracion
        items={[
          {
            id: "general",
            etiqueta: "General",
            estado: "Activa",
            completo: true,
            tono: "exito",
          },
          {
            id: "qlik",
            etiqueta: "Qlik Cloud",
            estado: "Pendiente",
            completo: false,
            tono: "pendiente",
          },
        ]}
      />,
    ),
  );

  expect(container.textContent).toContain("1 de 2 listas");
  expect(container.querySelector('a[href="#general"]')).not.toBeNull();
  expect(container.querySelector('a[href="#qlik"]')?.textContent).toContain(
    "Pendiente",
  );
  expect(
    container
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow"),
  ).toBe("50");
});

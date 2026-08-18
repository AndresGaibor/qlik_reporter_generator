import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { PaginacionLista } from "./paginacion-lista";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

test("describe la paginación usando el término reportes", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <PaginacionLista
        paginaActual={1}
        totalPaginas={2}
        onIrPagina={() => undefined}
        inicio={0}
        total={12}
      />,
    );
  });

  expect(container.textContent).toContain("12 reportes");
  expect(container.textContent).not.toContain("automatizaciones");
});

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => (
    <a href="/">{children as never}</a>
  ),
}));
vi.mock("./visor-script-flujo-modal", () => ({
  VisorScriptFlujoModal: () => (
    <button type="button">Ver Script / Definición</button>
  ),
}));

import { ListaFlujos } from "./lista-flujos";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar(mostrarScript: boolean) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ListaFlujos
        flujos={
          [{ id: "flujo-1", nombre: "Ventas", espacioId: "espacio-1" }] as never
        }
        automatizaciones={[]}
        targetHost="tenant.qlikcloud.com"
        espacioId="espacio-1"
        paginaActual={1}
        totalPaginas={1}
        onPageChange={() => undefined}
        total={1}
        hayFiltros={false}
        mostrarScript={mostrarScript}
      />,
    );
  });
  return container;
}

test("oculta Ver Script / Definición cuando la vista no permite contenido técnico", () => {
  const vista = montar(false);
  expect(vista.textContent).not.toContain("Ver Script / Definición");
});

test("muestra Ver Script / Definición cuando la vista permite contenido técnico", () => {
  const vista = montar(true);
  expect(vista.textContent).toContain("Ver Script / Definición");
});

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { BarraFiltrosReportes } from "./barra-filtros-reportes";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <BarraFiltrosReportes
        busquedaTemp="clientes"
        setBusquedaTemp={() => undefined}
        buscar={(evento: React.FormEvent) => evento.preventDefault()}
        limpiar={() => undefined}
        espacios={[{ id: "space-1", nombre: "Ventas" }]}
        espacioFiltrado="space-1"
        onEspacioChange={() => undefined}
        totalResultados={3}
      />,
    );
  });
  return container;
}

test("mantiene los filtros compactos sin un botón Buscar permanente", () => {
  const vista = montar();
  const botones = Array.from(vista.querySelectorAll("button"));

  expect(vista.textContent).toContain("Reportes");
  expect(vista.textContent).toContain("Filtrar por espacio");
  expect(vista.textContent).toContain("Buscar reportes");
  expect(vista.textContent).toContain("3 reportes");
  expect(botones.some((boton) => boton.textContent?.trim() === "Buscar")).toBe(
    false,
  );
  expect(vista.querySelector('input[type="search"]')).not.toBeNull();
});

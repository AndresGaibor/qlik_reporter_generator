import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ListaEjecuciones } from "./lista-ejecuciones";

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
      <ListaEjecuciones
        ejecuciones={[
          {
            id: "12345678-1234-1234-1234-123456789abc",
            estado: "finished",
            iniciadoEn: "2026-07-30T10:00:00.000Z",
            finalizadoEn: "2026-07-30T10:01:30.000Z",
          },
          {
            id: "87654321-4321-4321-4321-cba987654321",
            estado: "failed",
            iniciadoEn: "2026-07-29T10:00:00.000Z",
            finalizadoEn: "2026-07-29T10:00:10.000Z",
            error: { message: "Conexión rechazada por el destino" },
          },
        ]}
      />,
    );
  });
  return container;
}

test("presenta estados, duración e identificadores de forma legible", () => {
  const vista = montar();

  expect(vista.textContent).toContain("Historial de ejecuciones");
  expect(vista.textContent).toContain("Completada");
  expect(vista.textContent).toContain("Fallida");
  expect(vista.textContent).toContain("12345678…789abc");
  expect(vista.textContent).toContain("1 min 30 s");
  expect(vista.textContent).toContain("Más reciente");
});

test("hace visible el motivo de una ejecución fallida", () => {
  const vista = montar();

  expect(vista.textContent).toContain("Conexión rechazada por el destino");
  expect(
    vista.querySelector('[title="87654321-4321-4321-4321-cba987654321"]'),
  ).not.toBeNull();
});

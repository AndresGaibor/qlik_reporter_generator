import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { EstadoAccesoResultados } from "./estado-acceso-resultados";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
});

function montar(sesion: boolean, sinEntornos: boolean) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <EstadoAccesoResultados sesion={sesion} sinEntornos={sinEntornos} />,
    ),
  );
  return container;
}

test("muestra carga mientras la sesión no está disponible", () => {
  expect(montar(false, false).textContent).toContain("Cargando sesión");
});

test("explica cuando no existen entornos Qlik", () => {
  expect(montar(true, true).textContent).toContain(
    "No tienes ningún entorno Qlik configurado",
  );
});

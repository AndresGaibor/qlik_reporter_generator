import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { EstadoCarga } from "./estado-carga";

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

test("comunica la carga con estado accesible y spinner visual", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<EstadoCarga mensaje="Consultando BigQuery…" />));

  expect(container.querySelector("output")).not.toBeNull();
  expect(container.textContent).toContain("Consultando BigQuery…");
  expect(container.querySelector('[data-spinner="true"]')).not.toBeNull();
});

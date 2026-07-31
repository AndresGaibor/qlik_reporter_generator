import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { PageHeader } from "./page-header";

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

test("usa un encabezado semántico y agrupa acciones responsive", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <PageHeader
        title="Resultados BigQuery"
        description="Explora tablas"
        actions={<button type="button">Actualizar</button>}
      />,
    ),
  );

  expect(container.querySelector("header h1")?.textContent).toBe(
    "Resultados BigQuery",
  );
  expect(container.querySelector("[data-page-actions]")).not.toBeNull();
});

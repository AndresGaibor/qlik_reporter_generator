import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { PestanaMetadataFlujo } from "./pestana-metadata-flujo";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

test("retira el JSON avanzado del detalle del Dataflow para todos los usuarios", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PestanaMetadataFlujo
        flujo={
          {
            id: "flujo-1",
            nombre: "Ventas",
            espacioId: "espacio-1",
            espacioNombre: "Finanzas",
            modificadoEn: "2026-08-18T12:00:00Z",
          } as never
        }
      />,
    );
  });

  expect(container.textContent).toContain("Detalles del Dataflow");
  expect(container.textContent).not.toContain("Ver JSON avanzado");
  expect(container.textContent).not.toContain("METADATA_JSON_DATAFLOW");
  expect(container.textContent).not.toContain("Copiar JSON");
});

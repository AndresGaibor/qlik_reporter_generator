import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { NavegacionConfiguracion } from "./navegacion-configuracion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  history.replaceState(null, "", window.location.pathname);
});

test("navega por las seis secciones y marca la activa", () => {
  history.replaceState(null, "", "#bigquery");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const items = [
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
      estado: "Conectado",
      completo: true,
      tono: "exito",
    },
    {
      id: "oauth",
      etiqueta: "OAuth",
      estado: "Verificado",
      completo: true,
      tono: "exito",
    },
    {
      id: "plantilla",
      etiqueta: "Plantilla base",
      estado: "Configurada",
      completo: true,
      tono: "exito",
    },
    {
      id: "bigquery",
      etiqueta: "BigQuery",
      estado: "Conectada",
      completo: true,
      tono: "exito",
    },
    {
      id: "usuarios",
      etiqueta: "Usuarios",
      estado: "1 autorizado",
      completo: true,
      tono: "exito",
    },
  ] as const;

  act(() => root?.render(<NavegacionConfiguracion items={[...items]} />));
  expect(container.querySelectorAll("a")).toHaveLength(6);
  expect(
    container
      .querySelector('a[href="#bigquery"]')
      ?.getAttribute("aria-current"),
  ).toBe("location");
});

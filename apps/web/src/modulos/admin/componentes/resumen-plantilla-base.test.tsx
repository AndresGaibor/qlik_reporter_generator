import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ResumenPlantillaBase } from "./resumen-plantilla-base";
import { SeccionAutomatizacionBaseTenant } from "./seccion-automatizacion-base-tenant";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
});

test("muestra la plantilla activa sin exponer el ID técnico", () => {
  const cambiar = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResumenPlantillaBase
        nombre="Automatización Base Ventas"
        entorno="Producción"
        host="empresa.qlikcloud.com"
        onCambiar={cambiar}
      />,
    ),
  );

  expect(container.textContent).toContain("Automatización Base Ventas");
  expect(container.textContent).not.toContain("ID:");
  const boton = container.querySelector("button");
  act(() => boton?.click());
  expect(cambiar).toHaveBeenCalledOnce();
});

test("la sección configurada inicia en resumen y oculta el ID técnico", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SeccionAutomatizacionBaseTenant
        organizacionId="org"
        tenantsQlik={[
          {
            id: "q1",
            organizacionId: "org",
            tenantIdQlik: "tenant",
            host: "empresa.qlikcloud.com",
            nombre: "Producción",
            estado: "activo",
            esPrincipal: true,
            creadoEn: "2026-07-25",
            automatizacionBaseIdQlik: "ac8fa98d-92c6-4b60-9378-b5d921b07e09",
            automatizacionBaseNombre: "Automatización Base Ventas",
          },
        ]}
      />,
    ),
  );
  expect(container.textContent).toContain("Automatización Base Ventas");
  expect(container.textContent).not.toContain("ac8fa98d");
  expect(container.textContent).toContain("Cambiar plantilla");
});

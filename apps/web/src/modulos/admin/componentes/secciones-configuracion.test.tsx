import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { SeccionInfoTenant } from "./seccion-info-tenant";
import { SeccionQlikCloud } from "./seccion-qlik-cloud";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
});

function montar(elemento: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(elemento));
  return container;
}

test("general oculta datos técnicos y peligro hasta solicitarlos", () => {
  const vista = montar(
    <SeccionInfoTenant
      tenant={{
        id: "1",
        nombre: "Aliware",
        slug: "aliware",
        estado: "activa",
        creadoEn: "2026-07-25",
        usuarios: [],
      }}
      onActualizarEstado={vi.fn()}
      onActualizarNombre={vi.fn()}
      actualizar={{ isPending: false }}
    />,
  );

  expect(vista.textContent).toContain("Aliware");
  expect(vista.textContent).not.toContain("Identificador interno");
  expect(vista.textContent).not.toContain("Desactivar");
  const boton = Array.from(vista.querySelectorAll("button")).find((item) =>
    item.textContent?.includes("Detalles y acciones"),
  );
  act(() => boton?.click());
  expect(vista.textContent).toContain("Identificador interno");
  expect(vista.textContent).toContain("Desactivar plataforma");
});

test("Qlik Cloud muestra conexiones y abre el formulario bajo demanda", () => {
  const vista = montar(
    <SeccionQlikCloud
      tenant={{ id: "org-1" }}
      tenantsQlik={[
        {
          id: "q1",
          organizacionId: "org-1",
          tenantIdQlik: "tenant-1",
          host: "empresa.us.qlikcloud.com",
          nombre: "Producción",
          estado: "activo",
          esPrincipal: true,
          tieneDestinoApiKey: false,
          destinoApiKeyMascara: null,
          creadoEn: "2026-07-25",
        },
      ]}
      onCrear={vi.fn()}
      onEliminar={vi.fn()}
      onHacerPrincipal={vi.fn()}
      crear={{ isPending: false }}
      eliminar={{ isPending: false }}
      hacerPrincipal={{ isPending: false }}
    />,
  );

  expect(vista.textContent).toContain("Producción");
  expect(vista.querySelector("#host-qlik")).toBeNull();
  const boton = Array.from(vista.querySelectorAll("button")).find((item) =>
    item.textContent?.includes("Agregar entorno"),
  );
  act(() => boton?.click());
  expect(vista.querySelector("#host-qlik")).not.toBeNull();
  expect(vista.textContent).toContain("Cancelar");
});

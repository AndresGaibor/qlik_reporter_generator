import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ResumenPlantillaBase } from "./resumen-plantilla-base";
import { SeccionAutomatizacionBaseTenant } from "./seccion-automatizacion-base-tenant";

const { listarWorkers, recrearWorker, mostrarError } = vi.hoisted(() => ({
  listarWorkers: vi.fn(),
  recrearWorker: vi.fn(),
  mostrarError: vi.fn(),
}));
listarWorkers.mockResolvedValue([]);
vi.mock("@/modulos/admin/api", () => ({
  listarWorkersTenant: listarWorkers,
  recrearWorkerTenant: recrearWorker,
  listarAutomatizacionesParaAdmin: vi.fn(async () => []),
  configurarAutomatizacionBaseTenant: vi.fn(),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError, mostrarExito: vi.fn() }),
}));

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

test("describe la plantilla como worker personal de primer uso, no por reporte", () => {
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
            automatizacionBaseIdQlik: "base-1",
            automatizacionBaseNombre: "Base",
          },
        ]}
      />,
    ),
  );
  expect(container.textContent).toContain(
    "automatización personal de cada usuario en su primer uso",
  );
  expect(container.textContent).not.toContain(
    "se copiará al crear cada reporte",
  );
});

test("solo ofrece recrear para error y muestra el fallo de recreación", async () => {
  listarWorkers.mockResolvedValueOnce([
    {
      id: "worker-error",
      usuarioId: "u1",
      usuarioNombre: "Ana",
      usuarioCorreo: null,
      usuarioIdQlik: "q1",
      usuarioNombreQlik: "Ana Qlik",
      usuarioCorreoQlik: null,
      automatizacionIdQlik: "auto-error",
      automatizacionNombre: "Worker error",
      estado: "error",
      mensajeError: "Contrato incompatible",
    },
    {
      id: "worker-disabled",
      usuarioId: "u2",
      usuarioNombre: "Luis",
      usuarioCorreo: null,
      usuarioIdQlik: null,
      usuarioNombreQlik: null,
      usuarioCorreoQlik: null,
      automatizacionIdQlik: "auto-disabled",
      automatizacionNombre: "Worker desactivado",
      estado: "desactivado",
      mensajeError: "Desactivado",
    },
  ]);
  recrearWorker.mockRejectedValueOnce(
    new Error("No se pudo recrear el worker"),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
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
            automatizacionBaseIdQlik: "base-1",
            automatizacionBaseNombre: "Base",
          },
        ]}
      />,
    );
  });
  await act(async () => {});

  expect(container.textContent).toContain("Recrear desde plantilla");
  expect(container.querySelectorAll("button")).toHaveLength(2);
  const botonRecrear = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Recrear desde plantilla",
  );
  await act(async () => botonRecrear?.click());
  expect(mostrarError).toHaveBeenCalledWith("No se pudo recrear el worker");
});

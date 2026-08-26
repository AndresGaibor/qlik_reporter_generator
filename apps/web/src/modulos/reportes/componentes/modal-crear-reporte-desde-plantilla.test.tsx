import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ModalCrearReporteDesdePlantilla } from "./modal-crear-reporte-desde-plantilla";

const api = vi.hoisted(() => ({
  crearReporteDesdePlantilla: vi.fn(),
}));
vi.mock("@/modulos/reportes/api", () => api);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  api.crearReporteDesdePlantilla.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

test("Crear reporte clona la plantilla y abre la copia directamente en Qlik", async () => {
  api.crearReporteDesdePlantilla.mockResolvedValue({
    id: "copia-1",
    nombre: "Ventas mensual",
  });
  const ventana = {
    location: { href: "about:blank" },
    opener: window,
    close: vi.fn(),
  };
  const abrir = vi.spyOn(window, "open").mockReturnValue(ventana as never);
  const onCreado = vi.fn();
  const onCerrar = vi.fn();

  await act(async () => {
    root.render(
      <ModalCrearReporteDesdePlantilla
        abierto
        plantillas={[{ id: "base-1", nombre: "Base Ventas" }]}
        host="tenant.qlikcloud.com"
        onCerrar={onCerrar}
        onCreado={onCreado}
      />,
    );
  });

  const boton = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === "Crear reporte",
  );
  await act(async () => boton?.click());

  expect(abrir).toHaveBeenCalledWith("about:blank", "_blank");
  expect(api.crearReporteDesdePlantilla).toHaveBeenCalledWith(
    "Copia de Base Ventas",
    "base-1",
  );
  expect(ventana.opener).toBeNull();
  expect(ventana.location.href).toBe(
    "https://tenant.qlikcloud.com/dataflow/copia-1/editor",
  );
  expect(onCreado).toHaveBeenCalledOnce();
  expect(onCerrar).toHaveBeenCalledOnce();
});

test("si falla el clonado cierra la pestaña provisional y conserva el error", async () => {
  api.crearReporteDesdePlantilla.mockRejectedValue(
    new Error("Qlik rechazó la copia"),
  );
  const ventana = {
    location: { href: "about:blank" },
    opener: window,
    close: vi.fn(),
  };
  vi.spyOn(window, "open").mockReturnValue(ventana as never);

  await act(async () => {
    root.render(
      <ModalCrearReporteDesdePlantilla
        abierto
        plantillas={[{ id: "base-1", nombre: "Base Ventas" }]}
        host="tenant.qlikcloud.com"
        onCerrar={vi.fn()}
        onCreado={vi.fn()}
      />,
    );
  });

  const boton = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === "Crear reporte",
  );
  await act(async () => boton?.click());

  expect(ventana.close).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Qlik rechazó la copia");
});

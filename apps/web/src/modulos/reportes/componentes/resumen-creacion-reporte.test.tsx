import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ResumenCreacionReporte } from "./resumen-creacion-reporte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
});

function montar(props: Partial<React.ComponentProps<typeof ResumenCreacionReporte>> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResumenCreacionReporte
        tabla="ventas"
        cantidadCampos={12}
        periodo="01 jul – 31 jul 2026"
        requisitoPendiente={null}
        estimacion={{ costoEstimadoUsd: 0.01523781, bytesProcesados: 2_680_000_000 }}
        cargandoCosto={false}
        guardando={false}
        onCrear={vi.fn()}
        {...props}
      />,
    ),
  );
  return container;
}

test("muestra costo legible y habilita la acción completa", () => {
  const vista = montar();
  expect(vista.textContent).toContain("$0,02 USD");
  expect(vista.textContent).toContain("2,50 GB");
  expect(vista.textContent).toContain("12 campos");
  expect(vista.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
});
test("explica el requisito pendiente y deshabilita crear", () => {
  const vista = montar({
    requisitoPendiente: "Selecciona un periodo para crear el reporte.",
    periodo: "Pendiente",
  });
  expect(vista.textContent).toContain(
    "Selecciona un periodo para crear el reporte.",
  );
  expect(vista.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
});

test("muestra un error de estimación sin bloquear la creación", () => {
  const vista = montar({
    estimacion: undefined,
    errorCosto: "No se pudo calcular el costo",
  });
  expect(vista.textContent).toContain("No se pudo calcular el costo");
  expect(vista.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
});
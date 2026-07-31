import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { SelectorPeriodoReporte } from "./selector-periodo-reporte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});

test("permite elegir el campo de fecha y un rango rápido", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 31, 12));
  const onCampoFecha = vi.fn();
  const onRango = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SelectorPeriodoReporte
        camposFecha={["Fecha", "Fecha_Cierre"]}
        campoFecha="Fecha"
        onCampoFecha={onCampoFecha}
        onRango={onRango}
      />,
    ),
  );
  const selector = container.querySelector<HTMLSelectElement>("select");
  act(() => {
    if (selector) {
      selector.value = "Fecha_Cierre";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  expect(onCampoFecha).toHaveBeenCalledWith("Fecha_Cierre");
  const rapido = Array.from(container.querySelectorAll("button")).find(
    (boton) => boton.textContent === "Últimos 30 días",
  );
  act(() => rapido?.click());
  expect(onRango).toHaveBeenCalledTimes(1);
  const rango = onRango.mock.calls[0]?.[0];
  expect(rango.from).toEqual(new Date(2026, 6, 2, 12));
  expect(rango.to).toEqual(new Date(2026, 6, 31, 12));
  expect(container.textContent).toContain("Campo de fecha");
  expect(container.textContent).toContain("Periodo requerido");
});

test("explica cuando la tabla no tiene campos de fecha", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SelectorPeriodoReporte
        camposFecha={[]}
        campoFecha=""
        onCampoFecha={vi.fn()}
        onRango={vi.fn()}
      />,
    ),
  );
  expect(container.textContent).toContain(
    "No encontramos una columna de fecha compatible",
  );
});
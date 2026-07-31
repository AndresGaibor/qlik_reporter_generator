import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { SelectorCamposReporte } from "./selector-campos-reporte";
import { VistaPreviaReporte } from "./vista-previa-reporte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const campos = [
  { nombre: "Fecha", tipo: "DATE" },
  { nombre: "Cliente", tipo: "STRING" },
  { nombre: "Venta_USD", tipo: "NUMERIC" },
  { nombre: "Cantidad", tipo: "INTEGER" },
];

function montar(elemento: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(elemento));
  return container;
}
test("filtra campos por categoría y permite alternarlos", () => {
  const onAlternar = vi.fn();
  const vista = montar(
    <SelectorCamposReporte
      campos={campos}
      seleccionados={["Fecha", "Venta_USD"]}
      busqueda=""
      onBusqueda={vi.fn()}
      onAlternar={onAlternar}
      onSeleccionarVisibles={vi.fn()}
    />,
  );
  expect(vista.textContent).toContain("2 de 4 campos");
  const numeros = Array.from(vista.querySelectorAll("button")).find(
    (boton) => boton.textContent === "Números",
  );
  act(() => numeros?.click());
  expect(vista.textContent).toContain("Venta_USD");
  expect(vista.textContent).toContain("Cantidad");
  expect(vista.textContent).not.toContain("Cliente");
  const checkbox = vista.querySelector<HTMLInputElement>(
    'input[aria-label="Incluir Cantidad"]',
  );
  act(() => checkbox?.click());
  expect(onAlternar).toHaveBeenCalledWith("Cantidad");
});

test("la vista previa limita columnas y representa nulos con guion", () => {
  const muchosCampos = Array.from({ length: 10 }, (_, indice) => ({
    nombre: `campo_${indice}`,
    tipo: "STRING",
  }));
  const fila = Object.fromEntries(muchosCampos.map((campo) => [campo.nombre, null]));
  const vista = montar(
    <VistaPreviaReporte
      campos={muchosCampos}
      seleccionados={muchosCampos.map((campo) => campo.nombre)}
      filas={[fila]}
      cargando={false}
    />,
  );
  expect(vista.querySelectorAll("thead th")).toHaveLength(8);
  expect(vista.textContent).toContain("2 campos adicionales");
  expect(vista.textContent).toContain("—");
  expect(vista.innerHTML).not.toContain("slate-");
});
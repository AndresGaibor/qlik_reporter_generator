import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { CatalogoResultados } from "./catalogo-resultados";
import { EstadoResultados } from "./estado-resultados";

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

const recursos = [
  {
    id: "ventas",
    nombre: "ventas",
    tipo: "tabla" as const,
    espacioDeNombres: "demo",
    metadatos: {},
  },
  {
    id: "clientes",
    nombre: "clientes",
    tipo: "tabla" as const,
    espacioDeNombres: "demo",
    metadatos: {},
  },
];

function montar(elemento: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(elemento));
  return container;
}

test("muestra contexto, cantidad y filas compactas seleccionables", () => {
  const seleccionar = vi.fn();
  const vista = montar(
    <CatalogoResultados
      recursos={recursos}
      seleccionId="ventas"
      busqueda=""
      onBusquedaChange={() => undefined}
      onSeleccionar={seleccionar}
      dataset="demo_lafavorita"
    />,
  );

  expect(vista.textContent).toContain("demo_lafavorita");
  expect(vista.textContent).toContain("2 tablas");
  const botonClientes = Array.from(vista.querySelectorAll("button")).find(
    (boton) => boton.textContent?.includes("clientes"),
  );
  act(() => botonClientes?.click());
  expect(seleccionar).toHaveBeenCalledWith("clientes");
  expect(vista.querySelector('[aria-pressed="true"]')?.textContent).toContain(
    "ventas",
  );
});

test("distingue catálogo vacío de una búsqueda sin coincidencias", () => {
  const vacio = montar(
    <CatalogoResultados
      recursos={[]}
      seleccionId={null}
      busqueda=""
      onBusquedaChange={() => undefined}
      onSeleccionar={() => undefined}
      dataset="demo"
    />,
  );
  expect(vacio.textContent).toContain("Este dataset todavía no tiene tablas");
});

test("ofrece configurar BigQuery cuando no existe conexión", () => {
  const vista = montar(<EstadoResultados tipo="sin-conexion" />);
  expect(vista.textContent).toContain("Configura BigQuery");
  expect(vista.querySelector('a[href="/configuracion"]')).not.toBeNull();
});

test("explica un dataset vacío sin pedir seleccionar una tabla", () => {
  const vista = montar(<EstadoResultados tipo="catalogo-vacio" />);
  expect(vista.textContent).toContain("El dataset todavía no tiene tablas");
  expect(vista.textContent).not.toContain("Selecciona una tabla");
});

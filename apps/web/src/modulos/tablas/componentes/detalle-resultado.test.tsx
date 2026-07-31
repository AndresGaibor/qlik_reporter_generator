import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { DetalleResultado } from "./detalle-resultado";

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

const detalle = {
  id: "ventas",
  nombre: "ventas",
  tipo: "tabla" as const,
  espacioDeNombres: "demo_lafavorita",
  metadatos: {},
  columnas: [
    { nombre: "venta_id", tipo: "INTEGER" },
    { nombre: "fecha", tipo: "DATE" },
  ],
  totalFilas: 1250,
  actualizadoEn: "2026-07-31T05:00:00.000Z",
};

function montar(elemento: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(elemento));
  return container;
}

test("resume la tabla y ofrece crear un reporte sin acciones administrativas", () => {
  const vista = montar(
    <DetalleResultado
      detalle={detalle}
      pestana="campos"
      onPestanaChange={() => undefined}
      filasPreview={[]}
      cargandoPreview={false}
    />,
  );

  expect(vista.textContent).toContain("demo_lafavorita.ventas");
  expect(vista.textContent).toContain("1.250");
  expect(vista.textContent).toContain("2 campos");
  expect(vista.textContent).toContain("venta_id");
  expect(
    vista.querySelector('a[href*="/reportes/nueva"]')?.textContent,
  ).toContain("Crear reporte con esta tabla");
  expect(vista.textContent).not.toContain("Editar reporte");
  expect(vista.textContent).not.toContain("Aprobación");
  expect(vista.textContent).not.toContain("Historial de cambios");
});

test("muestra una vista previa estable y representa null con un guion", () => {
  const vista = montar(
    <DetalleResultado
      detalle={detalle}
      pestana="preview"
      onPestanaChange={() => undefined}
      filasPreview={[
        { venta_id: 1, cliente: "Ana" },
        { venta_id: 2, cliente: null, ciudad: "Quito" },
      ]}
      cargandoPreview={false}
    />,
  );

  expect(vista.textContent).toContain("venta_id");
  expect(vista.textContent).toContain("cliente");
  expect(vista.textContent).toContain("ciudad");
  expect(vista.textContent).toContain("—");
});

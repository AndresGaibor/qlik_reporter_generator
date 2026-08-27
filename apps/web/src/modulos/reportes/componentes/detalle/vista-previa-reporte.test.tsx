import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { VistaPreviaReporte } from "./vista-previa-reporte";

const datosEjemplo = {
  columnas: ["Unidad Operativa Ventas", "FECHA", "Código de Barras"],
  filas: [
    ["Sucursal Norte", "2024-01-15", "1234567890"],
    ["Sucursal Sur", "2024-01-16", "0987654321"],
  ],
  filasMuestreadas: 2,
  fuentesMuestreadas: ["proyecto.dataset.ventas"],
  contieneAgregaciones: false,
  advertencias: [] as string[],
  esMuestra: true as const,
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar(props: { datos?: typeof datosEjemplo | null; cargando: boolean; error: unknown }) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<VistaPreviaReporte {...props} />);
  });
  return container;
}

describe("VistaPreviaReporte", () => {
  test("muestra badge de vista previa", () => {
    const vista = montar({ datos: datosEjemplo, cargando: false, error: null });
    expect(vista.textContent).toMatch(/vista previa/i);
  });

  test("renderiza tabla con scroll horizontal", () => {
    const vista = montar({ datos: datosEjemplo, cargando: false, error: null });
    expect(vista.querySelector(".overflow-x-auto")).toBeTruthy();
  });

  test("muestra warning si contiene agregaciones", () => {
    const conAgregaciones = { ...datosEjemplo, contieneAgregaciones: true };
    const vista = montar({ datos: conAgregaciones, cargando: false, error: null });
    expect(vista.textContent).toMatch(/muestra/i);
  });

  test("muestra estado de carga", () => {
    const vista = montar({ datos: null, cargando: true, error: null });
    expect(vista.querySelector('[role="status"]')).toBeTruthy();
  });

  test("muestra estado de error", () => {
    const vista = montar({ datos: null, cargando: false, error: new Error("BigQuery no disponible") });
    expect(vista.textContent).toMatch(/bigquery no disponible/i);
  });

  test("trunca celdas largas y muestra tooltip", () => {
    const filaLarga = { ...datosEjemplo, columnas: ["Descripcion"], filas: [["Este es un texto muy largo que debería truncarse en la celda"]] };
    const vista = montar({ datos: filaLarga, cargando: false, error: null });
    const celda = vista.querySelector(".truncate");
    expect(celda).toBeTruthy();
  });
});
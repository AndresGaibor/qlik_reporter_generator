import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ResumenConfiguracionReporte } from "./resumen-configuracion-reporte";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => {
    root?.render(
      <ResumenConfiguracionReporte
        configuracion={{
          tabla: "clientes",
          columnas: ["id", "nombre", "email"],
          rango: {
            from: new Date(2026, 5, 1),
            to: new Date(2026, 5, 30),
          },
        }}
        onGuardarCambios={async () => undefined}
      />,
    );
  });
  return container;
}

function boton(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find(
    (elemento) => elemento.textContent?.includes(texto),
  );
}

test("muestra un resumen compacto antes de editar", () => {
  const vista = montar();

  expect(vista.textContent).toContain("Configuración del reporte");
  expect(vista.textContent).toContain("clientes");
  expect(vista.textContent).toContain("3 campos");
  expect(vista.textContent).toContain("1 jun");
  expect(boton("Editar configuración")).toBeDefined();
  expect(vista.textContent).not.toContain("Elige los campos del reporte");
});

test("despliega el formulario y permite cancelarlo", () => {
  const vista = montar();

  flushSync(() => boton("Editar configuración")?.click());
  expect(vista.textContent).toContain("Elige los campos del reporte");
  expect(boton("Cancelar")).toBeDefined();

  flushSync(() => boton("Cancelar")?.click());
  expect(vista.textContent).not.toContain("Elige los campos del reporte");
});

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ListaAutomatizaciones } from "./lista-automatizaciones";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const reporte = {
  id: "automation-1",
  nombre: "Reporte de clientes con un nombre suficientemente largo",
  espacioNombre: "Ventas POC",
  propietarioNombre: "Milton Coello",
  activa: true,
  modoEjecucion: "manual",
  ejecucionActiva: false,
  puedeEjecutar: true,
  ultimaEjecucionEstado: "finished",
  ultimaEjecucionInicio: "2026-07-30T20:00:00.000Z",
  ultimaEjecucionFin: "2026-07-30T20:01:30.000Z",
  creadoEn: "2026-07-29T10:00:00.000Z",
  modificadoEn: "2026-07-30T10:00:00.000Z",
};

function montar() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ListaAutomatizaciones
        automatizaciones={[reporte]}
        idEjecutando={null}
        espacioFiltrado="space-1"
        targetHost="tenant.qlikcloud.com"
        hayFiltros={false}
        onEjecutar={() => undefined}
      />,
    );
  });
  return container;
}

function botonConTexto(texto: string): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>("button, a, summary"),
  ).find((elemento) => elemento.textContent?.includes(texto));
}

test("presenta cada reporte como una fila operativa compacta", () => {
  const vista = montar();

  expect(vista.textContent).toContain("Reporte");
  expect(vista.textContent).toContain("Última ejecución");
  expect(vista.textContent).toContain("Estado");
  expect(vista.textContent).toContain("Completada");
  expect(vista.textContent).toContain("1 min 30 s");
  expect(vista.textContent).toContain("Disponible");
  expect(botonConTexto("Ejecutar reporte")).toBeDefined();
  expect(botonConTexto("Ver detalle")).toBeDefined();
  expect(vista.textContent).not.toContain("Funcionando");
  expect(vista.textContent).not.toContain("Última modificación");
});

test("mantiene Qlik Cloud dentro de acciones secundarias", () => {
  const vista = montar();
  const menu = vista.querySelector("details");

  expect(menu).not.toBeNull();
  expect(menu?.open).toBe(false);
  expect(menu?.textContent).toContain("Abrir en Qlik Cloud");

  act(() => botonConTexto("Más acciones")?.click());
  expect(menu?.open).toBe(true);
});

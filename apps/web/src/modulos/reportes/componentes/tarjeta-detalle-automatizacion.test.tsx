import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { TarjetaDetalleAutomatizacion } from "./tarjeta-detalle-automatizacion";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

const automatizacion = {
  id: "auto-12345678",
  nombre: "Reporte de clientes",
  espacioId: "space-1",
  espacioNombre: "Shared",
  propietarioId: "user-1",
  propietarioNombre: "Andres Gaibor",
  activa: true,
  modoEjecucion: "manual",
  ejecucionActiva: false,
  puedeEjecutar: true,
  creadoEn: "2026-07-29T10:00:00.000Z",
  modificadoEn: "2026-07-30T10:00:00.000Z",
};

const ultimaEjecucion = {
  id: "12345678-1234-1234-1234-123456789abc",
  estado: "finished",
  iniciadoEn: "2026-07-30T10:00:00.000Z",
  finalizadoEn: "2026-07-30T10:01:30.000Z",
};

function montar() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => {
    root?.render(
      <TarjetaDetalleAutomatizacion
        automatizacion={automatizacion}
        ejecutandoActiva={undefined}
        ultimaEjecucion={ultimaEjecucion}
        urlQlik="https://tenant.qlikcloud.com/automations/auto-12345678"
        onEjecutar={() => undefined}
        onDetener={() => undefined}
        onClonar={() => undefined}
        mutationEjecutar={{ mutate: () => undefined, isPending: false }}
        mutationDetener={{ mutate: () => undefined, isPending: false }}
        mostrarWorkspace={false}
      />,
    );
  });
  return container;
}

function botonConTexto(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((boton) =>
    boton.textContent?.includes(texto),
  );
}

test("prioriza el estado y la acción de ejecutar el reporte", () => {
  const vista = montar();

  expect(vista.textContent).toContain("Disponible");
  expect(botonConTexto("Ejecutar reporte")).toBeDefined();
  expect(vista.textContent).toContain("Última ejecución");
  expect(vista.textContent).toContain("Completada");
  expect(vista.textContent).toContain("1 min 30 s");
});

test("mantiene las acciones secundarias en un menú compacto", () => {
  const vista = montar();

  expect(vista.textContent).not.toContain("Clonar reporte");
  flushSync(() => botonConTexto("Más acciones")?.click());

  expect(vista.textContent).toContain("Clonar reporte");
  expect(vista.textContent).toContain("Abrir en Qlik Cloud");
});

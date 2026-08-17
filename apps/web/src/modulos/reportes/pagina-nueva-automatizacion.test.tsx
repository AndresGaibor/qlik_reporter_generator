import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const { crear, preflight } = vi.hoisted(() => ({
  crear: vi.fn(async (_entrada: Record<string, unknown>) => ({
    id: "auto-1",
    nombre: "Ventas",
    plantillaIdQlik: "base",
  })),
  preflight: vi.fn(async () => ({
    flujoIdQlik: "flujo-1",
    hashDataflowSha256: "a".repeat(64),
    compatible: true,
    operacionesNoSoportadas: [],
    sqlBigQuery: "SELECT * FROM `p.d.ventas`",
    bytesProcesados: 2_097_152,
    costoEstimadoUsd: 0.000011,
    resumen: { fuentes: 2, filtros: 3, joins: 1, camposSalida: 34 },
  })),
}));

vi.mock("@/modulos/flujos/api", () => ({
  obtenerFlujosConFiltros: vi.fn(async () => [
    {
      id: "flujo-1",
      nombre: "Ventas Comercial",
      espacioId: "espacio-1",
      espacioNombre: "Finanzas",
    },
  ]),
}));

vi.mock("./api", () => ({
  obtenerConexionesDestino: vi.fn(async () => []),
  obtenerRecursosDestino: vi.fn(async () => []),
  obtenerDetalleRecursoDestino: vi.fn(async () => ({ columnas: [] })),
  obtenerVistaPreviaDestino: vi.fn(async () => []),
  estimarConsultaDestino: vi.fn(async () => ({
    bytesProcesados: 0,
    costoEstimadoUsd: 0,
  })),
  preflightDataflowReporte: preflight,
  crearAutomatizacionDesdePlantilla: crear,
}));

vi.mock("@/modulos/autenticacion/api", () => ({
  obtenerSesion: vi.fn(async () => ({ usuario: { nombre: "Andres" } })),
}));

vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => (
    <a href="/reportes">{children as never}</a>
  ),
}));

import { PaginaNuevaAutomatizacion } from "./pagina-nueva-automatizacion";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const originalLocation = window.location;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: originalLocation,
    configurable: true,
  });
});

async function montar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <PaginaNuevaAutomatizacion />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Ventas Comercial");
    expect(container?.textContent).toContain("Dataflow compatible");
  });
  return container;
}

function boton(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((el) =>
    el.textContent?.includes(texto),
  );
}

test("diseña el reporte desde un Dataflow y no desde tabla/campos/fechas", async () => {
  const vista = await montar();

  expect(vista.textContent).toContain("Dataflow de Qlik");
  expect(vista.textContent).toContain("34 campos");
  expect(vista.textContent).toContain("3 filtros");
  expect(vista.textContent).toContain("1 join");
  expect(vista.textContent).toContain("2.00 MB");
  expect(vista.textContent).toContain("gs://bkt_dwh/POCs/TalendDescargados/");
  expect(vista.textContent).not.toContain("Elige la tabla de datos");
  expect(vista.textContent).not.toContain("Elige el periodo");
  expect(vista.textContent).not.toContain("selección de campos");
});

test("envía flujoId y programación, sin configuración manual BigQuery", async () => {
  await montar();
  const checkbox =
    container?.querySelector<HTMLInputElement>("#programar-reporte");
  const cron = container?.querySelector<HTMLInputElement>("#cron-reporte");
  expect(checkbox).toBeDefined();

  await act(async () => {
    checkbox?.click();
  });
  expect(cron?.disabled).toBe(false);
  await act(async () => {
    if (cron) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(cron, "30 7 * * 1-5");
      cron.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  Object.defineProperty(window, "location", {
    value: { ...originalLocation, href: "http://localhost/reportes/nuevo" },
    configurable: true,
  });

  await act(async () => {
    boton("Crear reporte")?.click();
  });
  await vi.waitFor(() => expect(crear).toHaveBeenCalledTimes(1));

  const entrada = crear.mock.calls[0]?.[0] as unknown as Record<
    string,
    unknown
  >;
  expect(entrada.flujoId).toBe("flujo-1");
  expect(entrada.programacion).toMatchObject({
    activa: true,
    expresionCron: "30 7 * * 1-5",
    zonaHoraria: "America/Guayaquil",
  });
  expect(entrada).not.toHaveProperty("tablaId");
  expect(entrada).not.toHaveProperty("columnas");
  expect(entrada).not.toHaveProperty("fechaDesde");
});

test("muestra el mensaje de error de Qlik cuando la sesión es requerida", async () => {
  const { obtenerFlujosConFiltros } = await import("@/modulos/flujos/api");
  vi.mocked(obtenerFlujosConFiltros).mockRejectedValueOnce(
    new Error("Sesión requerida"),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <PaginaNuevaAutomatizacion />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Sesión requerida");
  });
});

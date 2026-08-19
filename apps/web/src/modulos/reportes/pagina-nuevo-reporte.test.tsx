import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const { crear, preflight, navegar } = vi.hoisted(() => ({
  crear: vi.fn(async (_entrada: Record<string, unknown>) => ({
    id: "44444444-4444-4444-8444-444444444444",
    nombre: "Ventas",
    plantillaIdQlik: "base",
  })),
  navegar: vi.fn(),
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
  preflightDataflowReporte: preflight,
  crearReporte: crear,
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
  useNavigate: () => navegar,
}));

import { PaginaNuevoReporte } from "./pagina-nuevo-reporte";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const originalLocation = window.location;

afterEach(() => {
  if (root) act(() => root?.unmount());
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
        <PaginaNuevoReporte />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Ventas Comercial");
  });
  return container;
}

async function seleccionarDataflow(id = "flujo-1") {
  const select =
    container?.querySelector<HTMLSelectElement>("#dataflow-reporte");
  if (!select) throw new Error("No se encontró el selector Dataflow");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, id);
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Dataflow compatible");
  });
}

function boton(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((el) =>
    el.textContent?.includes(texto),
  );
}

test("no preselecciona ni ejecuta preflight hasta que el usuario elige un Dataflow", async () => {
  await montar();
  const select =
    container?.querySelector<HTMLSelectElement>("#dataflow-reporte");

  expect(select?.value).toBe("");
  expect(preflight).not.toHaveBeenCalled();
  expect(container?.textContent).toContain(
    "Selecciona un Dataflow para analizar su diseño.",
  );

  await seleccionarDataflow();
  expect(preflight).toHaveBeenCalledWith("flujo-1");
});

test("diseña el reporte desde un Dataflow y no desde tabla/campos/fechas", async () => {
  const vista = await montar();
  await seleccionarDataflow();

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

test("envía solo flujoId sin programacion", async () => {
  await montar();
  await seleccionarDataflow();
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
  expect(entrada.flujoIdQlik).toBe("flujo-1");
  expect(entrada).not.toHaveProperty("programacion");
  expect(entrada).not.toHaveProperty("tablaId");
  expect(entrada).not.toHaveProperty("columnas");
  expect(entrada).not.toHaveProperty("fechaDesde");
  expect(navegar).toHaveBeenCalledWith({
    to: "/reportes/44444444-4444-4444-8444-444444444444",
  });
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
        <PaginaNuevoReporte />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Sesión requerida");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const { api, navegar } = vi.hoisted(() => ({
  api: {
    obtenerReporte: vi.fn(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      nombre: "Reporte Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas",
      flujoEspacioIdQlik: null,
      destinoGcs: "gs://bucket/",
      activa: true,
      creadoPorUsuarioId: "22222222-2222-4222-8222-222222222222",
    })),
    obtenerEjecucionesReporte: vi.fn(async () => [
      {
        id: "e-1",
        estado: "completada",
        uriBaseGcs: "gs://bucket/reportes/e-1/",
        iniciadoEn: "2026-08-18T12:00:00Z",
        creadoEn: "2026-08-18T12:00:00Z",
        hashDataflowSha256: "a".repeat(64),
        scriptDataflow: "LOAD 1",
        sqlBigQueryCompilado: "SELECT 1",
        scriptExportacion: "EXPORT",
        versionCompilador: 1,
        runIdQlik: "run-1",
        mensajeError: null,
        etapaError: null,
      } as never,
    ]),
    preflightDataflowReporte: vi.fn(async () => ({
      flujoIdQlik: "df-1",
      hashDataflowSha256: "a".repeat(64),
      compatible: true,
      operacionesNoSoportadas: [],
      sqlBigQuery: "SELECT 1",
      bytesProcesados: 0,
      costoEstimadoUsd: 0,
      resumen: { fuentes: 1, filtros: 0, joins: 0, camposSalida: 1 },
    })),
    ejecutarReporte: vi.fn(async () => ({ runId: "run-1" })),
    clonarReporte: vi.fn(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
    })),
  },
  navegar: vi.fn(),
}));
vi.mock("@/modulos/reportes/api", () => api);
vi.mock("@/modulos/flujos/api", () => ({
  obtenerFlujosConFiltros: vi.fn(async () => []),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn(), mostrarExito: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => (
    <a href="/reportes">{children as never}</a>
  ),
  useNavigate: () => navegar,
}));
import { PaginaDetalleReporte } from "./pagina-detalle-reporte";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

test("carga reporte, preflight e historial usando UUID local", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <PaginaDetalleReporte id={id} />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Reporte Ventas"),
  );
  expect(api.obtenerReporte).toHaveBeenCalledWith(id);
  expect(api.obtenerEjecucionesReporte).toHaveBeenCalledWith(id);
  expect(api.preflightDataflowReporte).toHaveBeenCalledWith("df-1");
  expect(container?.textContent).toContain("Dataflow");
  expect(container?.textContent).toContain("Ventas");
  expect(container?.textContent).toContain("Espacio no disponible");
  expect(container?.textContent).toContain("Creado por");
  expect(container?.textContent).toContain("gs://bucket/");
  expect(container?.textContent).toContain("completada");
  expect(api).not.toHaveProperty("obtenerDetalleAutomatizacion");
  expect(api).not.toHaveProperty("detenerEjecucion");
});

test("ejecuta y clona usando el UUID local", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <PaginaDetalleReporte id={id} />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Reporte Ventas"),
  );
  const buttons = Array.from(container?.querySelectorAll("button") ?? []);
  await act(async () =>
    buttons.find((button) => button.textContent?.includes("Ejecutar"))?.click(),
  );
  await act(async () =>
    buttons.find((button) => button.textContent?.includes("Clonar"))?.click(),
  );
  expect(api.ejecutarReporte).toHaveBeenCalledWith(id);
  expect(api.clonarReporte).toHaveBeenCalledWith(id, {
    nombre: "Reporte Ventas (copia)",
  });
  expect(navegar).toHaveBeenCalledWith({
    to: "/reportes/33333333-3333-4333-8333-333333333333",
  });
});

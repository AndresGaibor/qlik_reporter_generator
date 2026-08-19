import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
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
  obtenerEjecucionesReporte: vi.fn(async () => []),
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
  useNavigate: () => vi.fn(),
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
  expect(api).not.toHaveProperty("obtenerDetalleAutomatizacion");
  expect(api).not.toHaveProperty("detenerEjecucion");
});

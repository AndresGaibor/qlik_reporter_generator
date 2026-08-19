import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  obtenerReporte: vi.fn(async () => ({
    id: "df-1",
    nombre: "Ventas",
    espacioId: "sp-1",
    espacioNombre: "Analítica",
    modificadoEn: "2026-08-18T12:00:00Z",
  })),
  obtenerResumenReporte: vi.fn(async () => ({
    flujoId: "df-1",
    nombre: "Ventas",
    campos: [],
    filtros: [],
    estado: "analizado",
    advertencias: [],
    analizadoEn: "2026-08-18T12:00:00Z",
  })),
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
  obtenerEjecucionesReporte: vi.fn(async () => []),
  ejecutarReporte: vi.fn(async () => ({ runId: "run-1" })),
}));
vi.mock("@/modulos/reportes/api", () => api);
vi.mock("@/compartido/hooks/use-tenant-activo", () => ({
  useTenantActivo: () => ({ tenant: { host: "tenant.qlikcloud.com" } }),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn(), mostrarExito: vi.fn() }),
}));
vi.mock("@/modulos/flujos/componentes/detalle/pestana-script-flujo", () => ({
  PestanaScriptFlujo: () => <div>Diseño del Dataflow</div>,
}));
vi.mock("@/modulos/flujos/componentes/detalle/pestana-metadata-flujo", () => ({
  PestanaMetadataFlujo: () => <div>Detalles del Dataflow</div>,
}));
vi.mock("@/modulos/reportes/componentes/estado-preflight", () => ({
  EstadoPreflight: () => <div>Preflight</div>,
}));
vi.mock(
  "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte",
  () => ({
    HistorialAuditoriaReporte: () => <div>Historial de ejecuciones</div>,
  }),
);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/reportes">{children}</a>
  ),
}));
import { PaginaDetalleReporte } from "./pagina-detalle-reporte";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

test("carga metadata, resumen, preflight e historial por el ID Qlik", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <PaginaDetalleReporte id="df-1" />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Diseño del Dataflow"),
  );
  expect(api.obtenerReporte).toHaveBeenCalledWith("df-1");
  expect(api.obtenerResumenReporte).toHaveBeenCalledWith("df-1");
  expect(api.preflightDataflowReporte).toHaveBeenCalledWith("df-1");
  expect(api.obtenerEjecucionesReporte).toHaveBeenCalledWith("df-1");
  expect(container?.textContent).not.toContain("Clonar");
  expect(container?.textContent).not.toContain("Inactivo");
});

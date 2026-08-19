import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  obtenerReportes: vi.fn(async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      nombre: "Reporte Ventas",
      espacioId: "sp-1",
      espacioNombre: "Ventas",
      modificadoEn: "2026-08-18T12:00:00Z",
    },
  ]),
  ejecutarReporte: vi.fn(),
  obtenerDataflowBaseReporte: vi.fn(async () => ({
    id: "base",
    nombre: "Base",
  })),
}));

vi.mock("./api", () => api);
vi.mock("@/modulos/reportes/componentes/barra-filtros-reportes", () => ({
  BarraFiltrosReportes: () => <h1>Reportes</h1>,
}));
vi.mock("@/modulos/reportes/componentes/lista-reportes", () => ({
  ListaReportes: ({ reportes }: { reportes: Array<{ nombre: string }> }) => (
    <div>
      {reportes.map((r) => (
        <span key={r.nombre}>{String(r.nombre)}</span>
      ))}
    </div>
  ),
}));
vi.mock("@/modulos/flujos/api", () => ({
  obtenerFlujosConFiltros: vi.fn(async () => []),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn(), mostrarExito: vi.fn() }),
}));
vi.mock("@/compartido/hooks/use-filtro-espacio-con-persistencia", () => ({
  useFiltroEspacioConPersistencia: () => ({
    espacioId: "",
    establecerEspacioId: vi.fn(),
  }),
}));
vi.mock("@/compartido/hooks/use-busqueda", () => ({
  useBusqueda: () => ({
    busquedaTemp: "",
    setBusquedaTemp: vi.fn(),
    busquedaActiva: "",
    setBusquedaActiva: vi.fn(),
    buscar: vi.fn(),
    limpiar: vi.fn(),
  }),
}));
vi.mock("@/compartido/hooks/use-paginacion", () => ({
  usePaginacion: (items: unknown[]) => ({
    paginaActual: 1,
    totalPaginas: 1,
    elementosPagina: items,
    irPagina: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@/modulos/reportes/hooks/use-busqueda-diferida", () => ({
  useBusquedaDiferida: vi.fn(),
}));
vi.mock("@/app/contexto-vista", () => ({ useVistaUsuarioFinal: () => true }));
vi.mock("@/compartido/componentes/ui/page-layout", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/compartido/componentes/feedback/estado-error", () => ({
  EstadoError: () => <div>Error</div>,
}));
vi.mock("@/compartido/componentes/ui/estado-carga", () => ({
  EstadoCarga: () => <div>Cargando</div>,
}));
vi.mock("@/compartido/hooks/use-manejo-error", () => ({
  useManejoError: () => ({ manejar: vi.fn() }),
}));
vi.mock("@/compartido/hooks/use-tenant-activo", () => ({
  useTenantActivo: () => ({ tenant: undefined }),
}));

import { PaginaReportes, filtrarReportes } from "./pagina-reportes";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

test("muestra reportes locales y no consulta ni ofrece Automates de Qlik", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <PaginaReportes />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Reporte Ventas"),
  );
  expect(container?.textContent).not.toContain("Automate manual Qlik");
  expect(api.obtenerReportes).toHaveBeenCalled();
});

test("muestra un solo encabezado principal de Reportes", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <PaginaReportes />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Reporte Ventas"),
  );
  expect(container?.querySelectorAll("h1")).toHaveLength(1);
});

test("filtra filas locales por nombre/Dataflow y espacio sin consultar Automates", () => {
  const reportes = [
    { ...api.obtenerReportes.mock.results[0]?.value, nombre: "Ventas" },
  ] as never;
  const filas = [
    {
      id: "1",
      nombre: "Ventas",
      espacioNombre: "Clientes",
      espacioId: "sp-1",
    },
    {
      id: "2",
      nombre: "Inventario",
      espacioNombre: "Ventas",
      espacioId: "sp-2",
    },
  ] as never;

  expect(filtrarReportes(filas, "ventas", "sp-2")).toEqual([filas[1]]);
  expect(reportes).toBeDefined();
});

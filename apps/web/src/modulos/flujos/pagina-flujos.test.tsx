import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const estado = vi.hoisted(() => ({ modoUsuarioFinal: false }));
const autenticacion = vi.hoisted(() => ({
  obtenerSesion: vi.fn(async () => ({
    tenantActivoId: "tenant-1",
    esSuperadmin: false,
    membresias: [
      { organizacionId: "org-1", organizacionNombre: "Org", rol: "admin" },
    ],
  })),
}));

vi.mock("@/app/contexto-vista", () => ({
  useVistaUsuarioFinal: () => estado.modoUsuarioFinal,
}));
vi.mock("@/modulos/autenticacion/api", () => autenticacion);
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn() }),
}));
vi.mock("@/compartido/componentes/ui/page-layout", () => ({
  PageLayout: ({ children }: { children: unknown }) => (
    <div>{children as never}</div>
  ),
}));
vi.mock("@/compartido/componentes/ui/page-header", () => ({
  PageHeader: () => null,
}));
vi.mock("@/compartido/componentes/ui/modal-seleccionar-tenant-qlik", () => ({
  ModalSeleccionarTenantQlik: () => null,
}));
vi.mock("@/compartido/hooks/use-busqueda", () => ({
  useBusqueda: () => ({
    busquedaTemp: "",
    setBusquedaTemp: vi.fn(),
    busquedaActiva: "",
    buscar: vi.fn(),
    limpiar: vi.fn(),
  }),
}));
vi.mock("@/compartido/hooks/use-filtro-espacio-con-persistencia", () => ({
  useFiltroEspacioConPersistencia: () => ({
    espacioId: "",
    establecerEspacioId: vi.fn(),
  }),
}));
vi.mock("@/compartido/hooks/use-manejo-error", () => ({
  useManejoError: () => ({ manejar: vi.fn() }),
}));
vi.mock("@/compartido/hooks/use-paginacion", () => ({
  usePaginacion: (items: unknown[]) => ({
    paginaActual: 1,
    totalPaginas: 1,
    elementosPagina: items,
    irPagina: vi.fn(),
  }),
}));
vi.mock("@/compartido/hooks/use-tenant-activo", () => ({
  useTenantActivo: () => ({
    tenant: {
      id: "tenant-1",
      host: "tenant.qlikcloud.com",
      organizacionId: "org-1",
    },
    tenants: [
      { id: "tenant-1", host: "tenant.qlikcloud.com", organizacionId: "org-1" },
    ],
    haySesion: true,
    sinTenantsDisponibles: false,
  }),
}));
vi.mock("@/modulos/flujos/api", () => ({
  obtenerFlujosConFiltros: vi.fn(async () => [
    { id: "flujo-1", nombre: "Ventas" },
  ]),
  obtenerEspacios: vi.fn(async () => []),
  obtenerDataflowBase: vi.fn(async () => null),
  clonarDataflowBase: vi.fn(),
}));
vi.mock("@/modulos/reportes/api", () => ({
  obtenerAutomatizaciones: vi.fn(async () => []),
}));
vi.mock("./componentes/barra-filtros-flujos", () => ({
  BarraFiltrosFlujos: () => null,
}));
vi.mock("./componentes/lista-flujos", () => ({
  ListaFlujos: ({ mostrarScript }: { mostrarScript?: boolean }) => (
    <div>{mostrarScript ? "SCRIPT_VISIBLE" : "SCRIPT_HIDDEN"}</div>
  ),
}));

import { PaginaFlujos } from "./pagina-flujos";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  estado.modoUsuarioFinal = false;
  vi.clearAllMocks();
});

async function montar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <PaginaFlujos />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() =>
    expect(container?.textContent).toMatch(/SCRIPT_(VISIBLE|HIDDEN)/),
  );
  return container;
}

test("permite el script en /flujos al administrador de la organización activa", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("SCRIPT_VISIBLE");
});

test("oculta el script en /flujos cuando el admin activa Vista usuario final", async () => {
  estado.modoUsuarioFinal = true;
  const vista = await montar();
  expect(vista.textContent).toContain("SCRIPT_HIDDEN");
});

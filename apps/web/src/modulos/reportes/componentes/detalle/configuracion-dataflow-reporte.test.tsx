import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  actualizarConfiguracionReporte: vi.fn(async () => ({})),
  preflightDataflowReporte: vi.fn(async () => ({
    compatible: true,
    resumen: { fuentes: 1, filtros: 0, joins: 0, camposSalida: 1 },
    hashDataflowSha256: "a".repeat(64),
  })),
}));
vi.mock("@/modulos/reportes/api", () => api);
vi.mock("@/modulos/flujos/api", () => ({
  obtenerFlujosConFiltros: vi.fn(async () => []),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn(), mostrarExito: vi.fn() }),
}));
import { ConfiguracionDataflowReporte } from "./configuracion-dataflow-reporte";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

test("guarda el reporte e invalida detalle y preflight del padre", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidar = vi.spyOn(client, "invalidateQueries");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <ConfiguracionDataflowReporte
          reporteId="reporte-1"
          configuracion={{
            id: "11111111-1111-4111-8111-111111111111",
            nombre: "Ventas",
            flujoIdQlik: "df-1",
            flujoNombreSnapshot: "Ventas",
            flujoEspacioIdQlik: "sp-1",
            destinoGcs: "gs://bucket/",
            activa: true,
            creadoPorUsuarioId: "22222222-2222-4222-8222-222222222222",
          }}
          preflight={
            {
              compatible: true,
              resumen: { fuentes: 1, filtros: 0, joins: 0, camposSalida: 1 },
              hashDataflowSha256: "a".repeat(64),
            } as never
          }
          validandoDataflow={false}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () =>
    Array.from(container?.querySelectorAll("button") ?? [])
      .find((b) => b.textContent?.includes("Editar"))
      ?.click(),
  );
  await vi.waitFor(() =>
    expect(container?.textContent).toContain("Dataflow compatible"),
  );
  await act(async () =>
    Array.from(container?.querySelectorAll("button") ?? [])
      .find((b) => b.textContent?.includes("Guardar"))
      ?.click(),
  );
  await vi.waitFor(() =>
    expect(api.actualizarConfiguracionReporte).toHaveBeenCalledWith(
      "reporte-1",
      expect.anything(),
    ),
  );
  expect(invalidar).toHaveBeenCalledWith({
    queryKey: ["reporte", "reporte-1"],
  });
  expect(invalidar).toHaveBeenCalledWith({
    queryKey: ["preflight-dataflow-reporte"],
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/modulos/descargas/api", () => ({
  listarDescargas: vi.fn().mockResolvedValue([
    {
      id: "e-1",
      reporteNombre: "Ventas Comercial",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      creadoEn: "2026-08-15T10:00:00Z",
      finalizadoEn: "2026-08-15T10:01:00Z",
    },
  ]),
  solicitarManifiesto: vi.fn().mockResolvedValue({
    descargaId: "e-1",
    archivos: [
      {
        nombre: "reporte.csv",
        url: "https://example.com/reporte.csv",
        tamano: 1024,
      },
    ],
  }),
}));

vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));

import { PaginaDescargas } from "./pagina-descargas";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
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
        <PaginaDescargas />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Descargas");
  });
  return container;
}

test("renderiza título Descargas", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Descargas");
});

test("renderiza nombre del reporte", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Ventas Comercial");
});

test("renderiza botón de descarga", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Descargar archivos");
});

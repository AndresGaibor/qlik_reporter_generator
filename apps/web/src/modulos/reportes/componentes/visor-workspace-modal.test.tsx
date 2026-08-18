import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
  obtenerWorkspaceAutomatizacion: vi.fn(async () => ({
    id: "auto-1",
    nombre: "Reporte",
    workspace: {
      blocks: [
        { id: "start", type: "StartBlock", displayName: "Inicio", inputs: [] },
      ],
    },
    schedules: [],
  })),
}));

vi.mock("../api", () => api);
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));

import { VisorWorkspaceModal } from "./visor-workspace-modal";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
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
        <VisorWorkspaceModal
          automatizacionId="auto-1"
          nombreAutomatizacion="Reporte"
        />
      </QueryClientProvider>,
    );
  });
  return container;
}

function botonConTexto(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((boton) =>
    boton.textContent?.includes(texto),
  );
}

test("muestra el workspace de Automate en modo claro y solo lectura", async () => {
  const vista = await montar();

  await act(async () => botonConTexto("Ver Script / Workspace")?.click());
  await vi.waitFor(() => expect(vista.textContent).toContain("Inicio"));
  await act(async () => botonConTexto("JSON")?.click());

  expect(vista.textContent).toContain("Solo lectura");
  expect(vista.textContent).not.toContain("Edición avanzada");
  expect(vista.textContent).not.toContain("Editar JSON");
  expect(vista.textContent).not.toContain("Guardar en Qlik");
  expect(vista.querySelector("textarea")).toBeNull();
});

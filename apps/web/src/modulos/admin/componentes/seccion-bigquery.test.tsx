import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  obtener: vi.fn(async () => ({
    configurada: true,
    id: "conexion-1",
    estado: "desconectado" as const,
    projectId: "poc-bigquery-talend",
    dataset: "demo_lafavorita",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    credencialesConfiguradas: true,
    mensajeError: null,
  })),
  guardar: vi.fn(async () => ({
    configurada: true,
    id: "conexion-1",
    estado: "desconectado" as const,
    projectId: "poc-bigquery-talend",
    dataset: "demo_lafavorita",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    credencialesConfiguradas: true,
    mensajeError: null,
  })),
  probar: vi.fn(async () => ({ exitoso: true, mensaje: "Conexión exitosa" })),
}));

const estado = vi.hoisted(() => ({
  configuracion: {
    configurada: true,
    id: "conexion-1",
    estado: "desconectado" as const,
    projectId: "poc-bigquery-talend",
    dataset: "demo_lafavorita",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    credencialesConfiguradas: true,
    mensajeError: null,
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: estado.configuracion,
    isLoading: false,
    isError: false,
  }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(async () => undefined),
  }),
  useMutation: (opciones: {
    mutationFn: () => Promise<unknown>;
    onSuccess?: (resultado: unknown) => void;
    onError?: (error: Error) => void;
  }) => ({
    isPending: false,
    mutate: () => {
      opciones
        .mutationFn()
        .then((resultado) => opciones.onSuccess?.(resultado))
        .catch((error) => opciones.onError?.(error));
    },
  }),
}));

vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({
    mostrarError: vi.fn(),
    mostrarExito: vi.fn(),
  }),
}));

vi.mock("../api", () => ({
  obtenerConfiguracionBigQuery: api.obtener,
  guardarConfiguracionBigQuery: api.guardar,
  probarConfiguracionBigQuery: api.probar,
}));

import { SeccionBigQuery } from "./seccion-bigquery";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  api.obtener.mockClear();
  api.guardar.mockClear();
  api.probar.mockClear();
});

async function montar() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <SeccionBigQuery organizacionId="org-1" tenantQlikId="tenant-q1" />,
    );
    await Promise.resolve();
  });
  return container;
}

function elementoConTexto(selector: string, texto: string) {
  return Array.from(
    container?.querySelectorAll<HTMLElement>(selector) ?? [],
  ).find((elemento) => elemento.textContent?.includes(texto));
}

test("muestra la configuración sin exponer la clave privada", async () => {
  const vista = await montar();

  expect(vista.textContent).toContain("BigQuery");
  expect(vista.textContent).toContain("poc-bigquery-talend");
  expect(vista.textContent).toContain("sa@example.iam.gserviceaccount.com");
  expect(vista.textContent).toContain("Credenciales protegidas");
  expect(vista.textContent).not.toContain("PRIVATE KEY");
  expect(vista.querySelector("textarea")).not.toBeNull();
});
test("permite guardar el dataset conservando las credenciales", async () => {
  await montar();
  const boton = elementoConTexto("button", "Guardar BigQuery");
  expect(boton).toBeDefined();

  await act(async () => {
    boton?.click();
    await Promise.resolve();
  });

  expect(api.guardar).toHaveBeenCalledWith(
    "org-1",
    "tenant-q1",
    expect.objectContaining({ dataset: "demo_lafavorita" }),
  );
  expect(
    (
      api.guardar.mock.calls[0] as unknown as [
        string,
        string,
        Record<string, unknown>,
      ]
    )?.[2],
  ).not.toHaveProperty("credencialesJson");
});

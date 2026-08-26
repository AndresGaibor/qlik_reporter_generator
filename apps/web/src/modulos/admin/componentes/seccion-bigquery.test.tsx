import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  guardar: vi.fn(async () => ({
    configurada: true,
    id: "conexion-1",
    estado: "activo" as const,
    projectId: "poc-bigquery-talend",
    dataset: "demo_lafavorita",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    credencialesConfiguradas: true,
    mensajeError: null,
  })),
  probar: vi.fn(async () => ({ exitoso: true, mensaje: "Conexión exitosa" })),
}));
const configuracion = {
  configurada: true,
  id: "conexion-1",
  estado: "activo" as const,
  projectId: "poc-bigquery-talend",
  dataset: "demo_lafavorita",
  clientEmail: "sa@example.iam.gserviceaccount.com",
  credencialesConfiguradas: true,
  mensajeError: null,
};
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: configuracion, isLoading: false, isError: false }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(async () => undefined),
  }),
  useMutation: (opciones: {
    mutationFn: () => Promise<unknown>;
    onSuccess?: (r: never) => void;
    onError?: (e: Error) => void;
  }) => {
    const ejecutar = async () => {
      try {
        const r = await opciones.mutationFn();
        opciones.onSuccess?.(r as never);
        return r;
      } catch (e) {
        opciones.onError?.(e as Error);
        throw e;
      }
    };
    return {
      isPending: false,
      mutate: () => void ejecutar(),
      mutateAsync: ejecutar,
    };
  },
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarError: vi.fn(), mostrarExito: vi.fn() }),
}));
vi.mock("../api", () => ({
  obtenerConfiguracionBigQuery: vi.fn(),
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
  vi.clearAllMocks();
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
function boton(texto: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((b) =>
    b.textContent?.includes(texto),
  );
}

test("una conexión configurada inicia en resumen sin exponer el formulario", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("poc-bigquery-talend");
  expect(vista.textContent).toContain("demo_lafavorita");
  expect(vista.textContent).toContain("Editar configuración");
  expect(vista.querySelector("textarea")).toBeNull();
  expect(vista.textContent).not.toContain("PRIVATE KEY");
});

test("abre edición bajo demanda y permite cancelarla", async () => {
  const vista = await montar();
  await act(async () => boton("Editar configuración")?.click());
  expect(vista.querySelector("#bigquery-dataset")).not.toBeNull();
  expect(vista.querySelector("textarea")).not.toBeNull();
  await act(async () => boton("Cancelar")?.click());
  expect(vista.querySelector("textarea")).toBeNull();
});

test("permite configurar el máximo de filas por archivo descargado", async () => {
  const vista = await montar();
  await act(async () => boton("Editar configuración")?.click());
  const input = vista.querySelector<HTMLInputElement>("#bigquery-max-rows");
  expect(input).not.toBeNull();
  expect(input?.value).toBe("1000000");
});

test("prueba la conexión directamente desde el resumen", async () => {
  await montar();
  await act(async () => {
    boton("Probar conexión")?.click();
    await Promise.resolve();
  });
  expect(api.probar).toHaveBeenCalledWith("org-1", "tenant-q1");
  expect(api.guardar).not.toHaveBeenCalled();
});

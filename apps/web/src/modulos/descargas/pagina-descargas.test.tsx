import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/modulos/descargas/api", () => ({
  urlCsvParteCarpetaUsuarioGcs: vi.fn(
    (ruta: string, archivo: string) =>
      `/api/descargas/carpeta/csv?ruta=${encodeURIComponent(ruta)}&archivo=${encodeURIComponent(archivo)}`,
  ),
  urlZipCarpetaUsuarioGcs: vi.fn(
    (ruta = "") =>
      `/api/descargas/carpeta/zip?ruta=${encodeURIComponent(ruta)}`,
  ),
  urlZipEjecucion: vi.fn(
    (id: string) => `/api/descargas/${encodeURIComponent(id)}/zip`,
  ),
  listarPartesNormalizadas: vi.fn((id: string) =>
    Promise.resolve({
      estado: "lista",
      partes: [
        {
          numero: 1,
          nombre: "parte-001.csv",
          url: `/api/descargas/${id}/partes/1`,
        },
        {
          numero: 2,
          nombre: "parte-002.csv",
          url: `/api/descargas/${id}/partes/2`,
        },
      ],
    }),
  ),
  listarDescargas: vi.fn().mockResolvedValue([
    {
      id: "e-1",
      creadoPorUsuarioId: "44444444-4444-4444-8444-444444444444",
      propietarioCorreo: "compartido@example.com",
      reporteNombre: "Ventas Comercial",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      creadoEn: "2026-08-15T10:00:00Z",
      finalizadoEn: "2026-08-15T10:01:00Z",
      archivos: [
        { nombre: "reporte.csv", formato: "CSV", tamano: 1024, fecha: null },
      ],
    },
  ]),
  listarCarpetaUsuarioGcs: vi.fn().mockImplementation(async (ruta = "") => {
    const ejecucionNueva = "2880a223-3ee1-4d25-95eb-9e5974b0cc53";
    const ejecucionAnterior = "460bcff9-427e-43e7-9974-32435e832639";
    const ejecucionHistorica = "998e6a63-394e-4646-af3e-75f43ddec547";
    const base = {
      bucket: "bkt_dwh",
      prefijoBase: "POCs/TalendDescargados/byronnasimba/",
      ruta,
      carpetaUsuario: "byronnasimba",
      archivos: [],
    };
    if (ruta === "test-bq-sftp/") {
      return {
        ...base,
        archivos: [
          {
            nombre: "pruebagcp.csv",
            formato: "CSV",
            tamano: 27,
            fecha: "2026-08-18T22:34:00.000Z",
          },
        ],
        carpetas: [
          `${ejecucionNueva}/`,
          `${ejecucionAnterior}/`,
          `${ejecucionHistorica}/`,
        ],
        carpetasEjecucion: [
          {
            carpeta: `${ejecucionNueva}/`,
            ejecucionId: ejecucionNueva,
            ejecutadoEn: "2026-08-20T20:31:00.000Z",
            esMasReciente: true,
          },
          {
            carpeta: `${ejecucionAnterior}/`,
            ejecucionId: ejecucionAnterior,
            ejecutadoEn: "2026-08-19T21:11:00.000Z",
            esMasReciente: false,
          },
        ],
      };
    }
    if (ruta === `test-bq-sftp/${ejecucionNueva}/`) {
      return {
        ...base,
        carpetas: [],
        ejecucionActual: {
          ejecucionId: ejecucionNueva,
          ejecutadoEn: "2026-08-20T20:31:00.000Z",
        },
      };
    }
    return {
      ...base,
      carpetas: ["test-bq-sftp/"],
      archivos: [
        {
          nombre: "pruebagcp.csv",
          formato: "CSV",
          tamano: 27,
          fecha: "2026-08-18T22:34:00.000Z",
        },
      ],
    };
  }),
  listarCarpetasUsuariosGcs: vi.fn().mockResolvedValue([
    {
      usuarioId: "u-1",
      correo: "andres.gaibor@aliwareint.com",
      carpeta: "andresgaibor",
    },
  ]),
  eliminarArchivoCarpetaUsuarioGcs: vi
    .fn()
    .mockResolvedValue({ eliminado: "pruebagcp.csv" }),
  eliminarDirectorioCarpetaUsuarioGcs: vi
    .fn()
    .mockResolvedValue({ eliminado: "test-bq-sftp/", objetosEliminados: 2 }),
  firmarArchivoCarpetaUsuarioGcs: vi.fn().mockResolvedValue({
    nombre: "pruebagcp.csv",
    url: "https://storage.example.com/user-signed",
  }),
  listarDescargasAdministracion: vi.fn().mockResolvedValue([
    {
      id: "e-admin-1",
      creadoPorUsuarioId: "44444444-4444-4444-8444-444444444444",
      propietarioCorreo: "ana.perez@aliwareint.com",
      reporteNombre: "Inventario",
      automatizacionIdQlik: "auto-admin",
      estado: "completada",
      mensajeError: null,
      creadoEn: "2026-08-16T10:00:00Z",
      finalizadoEn: "2026-08-16T10:01:00Z",
      archivos: [],
    },
    {
      id: "e-historica-1",
      creadoPorUsuarioId: null,
      propietarioCorreo: null,
      reporteNombre: "Legacy Report",
      automatizacionIdQlik: "auto-legacy",
      estado: "detenida",
      mensajeError: null,
      creadoEn: "2026-08-10T10:00:00Z",
      finalizadoEn: "2026-08-10T10:02:00Z",
      archivos: [],
    },
  ]),
  listarExploradorGcs: vi.fn().mockResolvedValue({
    bucket: "bkt_dwh",
    prefijoBase: "POCs/TalendDescargados/",
    ruta: "",
    carpetas: ["reportes/"],
    archivos: [
      {
        nombre: "mini-test-000000000000.csv.gz",
        formato: "CSV.GZ",
        tamano: 2048,
        fecha: "2026-08-18T15:00:00.000Z",
      },
    ],
  }),
  firmarArchivoExploradorGcs: vi.fn().mockResolvedValue({
    nombre: "mini-test-000000000000.csv.gz",
    url: "https://storage.example.com/signed",
  }),
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

vi.mock("@/modulos/autenticacion/api", () => ({
  obtenerSesion: vi.fn().mockResolvedValue({
    usuario: {
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "Byron Nasimba Quinatoa",
      correo: "byron.nasimba@aliwareint.com",
      avatarUrl: null,
    },
    tenantActivoId: "tenant-1",
    tenantsDisponibles: [],
    esSuperadmin: false,
    membresias: [],
  }),
}));

vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));

import { VistaContext } from "@/app/contexto-vista";
import {
  eliminarArchivoCarpetaUsuarioGcs,
  firmarArchivoCarpetaUsuarioGcs,
  listarCarpetaUsuarioGcs,
  listarExploradorGcs,
  listarPartesNormalizadas,
  urlCsvParteCarpetaUsuarioGcs,
} from "@/modulos/descargas/api";
import { PaginaDescargas } from "./pagina-descargas";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/descargas");
});

async function montar(
  vista: { modoUsuarioFinal: boolean; esAdmin: boolean } = {
    modoUsuarioFinal: false,
    esAdmin: false,
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <VistaContext.Provider value={vista}>
          <PaginaDescargas />
        </VistaContext.Provider>
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Descargas");
    expect(container?.textContent).toContain("byronnasimba");
  });
  return container;
}

test("renderiza tÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­tulo Descargas", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Descargas");
});

test("usuario final ve almacenamiento sin bloques de actividad ni acciones destructivas", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("byronnasimba");
  expect(vista.textContent).toContain("pruebagcp.csv");
  expect(vista.textContent).not.toContain("Actividad reciente");
  expect(vista.textContent).not.toContain("Actividad de usuarios");
  expect(vista.textContent).not.toContain(
    "Ejecuciones históricas no asignadas",
  );
  expect(vista.textContent).not.toContain("Eliminar");
  expect(listarExploradorGcs).not.toHaveBeenCalled();
});

test("admin puede solicitar eliminar un archivo de su carpeta con confirmacion", async () => {
  const vista = await montar({ modoUsuarioFinal: false, esAdmin: true });
  expect(vista.textContent).not.toContain("Actividad reciente");
  expect(vista.textContent).not.toContain("Actividad de usuarios");
  const eliminaciones = [...vista.querySelectorAll("button")].filter((boton) =>
    boton.textContent?.includes("Eliminar"),
  );
  const eliminar = eliminaciones.at(-1);
  expect(eliminar).toBeTruthy();
  await act(async () =>
    eliminar?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(vista.textContent).toContain("Eliminar archivo");
  const confirmar = [...vista.querySelectorAll("button")].find((boton) =>
    boton.textContent?.includes("Eliminar archivo"),
  );
  expect(confirmar).toBeTruthy();
  await act(async () =>
    confirmar?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await vi.waitFor(() =>
    expect(eliminarArchivoCarpetaUsuarioGcs).toHaveBeenCalledWith(
      "pruebagcp.csv",
    ),
  );
});

test("admin ve confirmacion reforzada al eliminar una carpeta", async () => {
  const vista = await montar({ modoUsuarioFinal: false, esAdmin: true });
  const fila = [...vista.querySelectorAll("div")].find(
    (elemento) =>
      elemento.textContent?.includes("test-bq-sftp") &&
      elemento.querySelectorAll("button").length >= 2,
  );
  const eliminar = [...(fila?.querySelectorAll("button") ?? [])].find((boton) =>
    boton.textContent?.includes("Eliminar"),
  );
  expect(eliminar).toBeTruthy();
  await act(async () =>
    eliminar?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(vista.textContent).toContain("Eliminar carpeta y todo su contenido");
});

test("recargar conserva la subcarpeta personal indicada en la URL", async () => {
  window.history.replaceState({}, "", "/descargas?carpeta=test-bq-sftp%2F");
  await montar();
  expect(listarCarpetaUsuarioGcs).toHaveBeenCalledWith("test-bq-sftp/");
  expect(container?.textContent).toContain("test-bq-sftp");
  expect(container?.textContent).not.toContain(
    "POCs/TalendDescargados/byronnasimba/test-bq-sftp",
  );
});
test("presenta ejecuciones por fecha y oculta los UUID completos", async () => {
  window.history.replaceState({}, "", "/descargas?carpeta=test-bq-sftp%2F");
  const vista = await montar();
  expect(vista.textContent).toContain("Más reciente");
  expect(vista.textContent).toContain("Ejecución del reporte");
  expect(vista.textContent).toContain("20 ago 2026");
  expect(vista.textContent).toContain("19 ago 2026");
  expect(vista.textContent).toContain("Ejecución 998e6a63…");
  expect(vista.textContent).not.toContain(
    "2880a223-3ee1-4d25-95eb-9e5974b0cc53",
  );
  expect(vista.textContent).not.toContain(
    "460bcff9-427e-43e7-9974-32435e832639",
  );
  expect(vista.textContent.indexOf("20 ago 2026")).toBeLessThan(
    vista.textContent.indexOf("19 ago 2026"),
  );
});

test("recargar dentro de una ejecución reemplaza el UUID del breadcrumb por su fecha", async () => {
  const ejecucion = "2880a223-3ee1-4d25-95eb-9e5974b0cc53";
  window.history.replaceState(
    {},
    "",
    `/descargas?carpeta=${encodeURIComponent(`test-bq-sftp/${ejecucion}/`)}`,
  );
  const vista = await montar();
  expect(vista.textContent).toContain("Ejecución · 20 ago 2026");
  expect(vista.textContent).not.toContain(ejecucion);
});

test("una carpeta de reporte sin ejecuciones se muestra como estado vacío y no como error", async () => {
  vi.mocked(listarCarpetaUsuarioGcs).mockResolvedValueOnce({
    bucket: "bkt_dwh",
    prefijoBase: "POCs/TalendDescargados/byronnasimba/",
    ruta: "nuevo-reporte/",
    carpetaUsuario: "byronnasimba",
    carpetas: [],
    archivos: [],
  });
  window.history.replaceState({}, "", "/descargas?carpeta=nuevo-reporte%2F");
  const vista = await montar();
  expect(vista.textContent).toContain("Aún no hay descargas para este reporte");
  expect(vista.textContent).toContain(
    "Ejecuta el reporte para generar la primera",
  );
  expect(vista.textContent).not.toContain(
    "No se pudo consultar Google Cloud Storage",
  );
});

test("descarga un archivo de la carpeta privada como CSV normalizado", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const vista = await montar();
  const boton = [...vista.querySelectorAll("button")].find((elemento) =>
    elemento.textContent?.includes("Descargar"),
  );
  expect(boton).toBeTruthy();
  await act(async () => {
    boton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await vi.waitFor(() => {
    expect(urlCsvParteCarpetaUsuarioGcs).toHaveBeenCalledWith(
      "",
      "pruebagcp.csv",
    );
    expect(firmarArchivoCarpetaUsuarioGcs).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });
  click.mockRestore();
});

test("ofrece descargar todos los archivos de la carpeta actual como ZIP", async () => {
  window.history.replaceState({}, "", "/descargas?carpeta=test-bq-sftp%2F");
  const vista = await montar();
  const enlace = [...vista.querySelectorAll("a")].find((item) =>
    item.textContent?.includes("Descargar todo (.zip)"),
  );
  expect(enlace).toBeTruthy();
  expect(enlace?.getAttribute("href")).toContain("carpeta/zip");
  expect(enlace?.getAttribute("href")).toContain("test-bq-sftp");
  expect(vista.textContent).toContain("1 archivo");
});

test("expande una descarga compartida y muestra sus archivos", async () => {
  const vista = await montar();
  const boton = [...vista.querySelectorAll("button")].find((elemento) =>
    elemento.textContent?.includes("Ver archivos"),
  );
  expect(boton).toBeTruthy();
  await act(async () => {
    boton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await vi.waitFor(() => expect(vista.textContent).toContain("parte-001.csv"));
  expect(
    [...vista.querySelectorAll("a")].some(
      (enlace) => enlace.getAttribute("href") === "/api/descargas/e-1/partes/1",
    ),
  ).toBe(true);
  expect(vista.textContent).toContain("compartido@example.com");
});

test("actualiza las partes terminadas sin recargar la pÃ¡gina", async () => {
  vi.mocked(listarPartesNormalizadas).mockResolvedValueOnce({
    estado: "preparando",
    partes: [
      {
        numero: 1,
        nombre: "parte-parcial.csv",
        url: "/api/descargas/e-1/partes/1",
      },
    ],
  });
  const vista = await montar();
  const boton = [...vista.querySelectorAll("button")].find((elemento) =>
    elemento.textContent?.includes("Ver archivos"),
  );
  await act(async () =>
    boton?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await vi.waitFor(() =>
    expect(vista.textContent).toContain("parte-parcial.csv"),
  );
  await vi.waitFor(() => expect(vista.textContent).toContain("parte-001.csv"), {
    timeout: 3_500,
  });
  expect(listarPartesNormalizadas).toHaveBeenCalledTimes(2);
});

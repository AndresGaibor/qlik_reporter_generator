import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
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
      archivos: [{ nombre: "reporte.csv", formato: "CSV", tamano: 1024, fecha: null }],
    },
  ]),
  listarCarpetaUsuarioGcs: vi.fn().mockImplementation(async (ruta = "") => ({
    bucket: "bkt_dwh",
    prefijoBase: "POCs/TalendDescargados/byronnasimba/",
    ruta,
    carpetaUsuario: "byronnasimba",
    carpetas: ruta ? [] : ["test-bq-sftp/"],
    archivos: [
      {
        nombre: "pruebagcp.csv",
        formato: "CSV",
        tamano: 27,
        fecha: "2026-08-18T22:34:00.000Z",
      },
    ],
  })),
  listarCarpetasUsuariosGcs: vi.fn().mockResolvedValue([
    {
      usuarioId: "u-1",
      correo: "andres.gaibor@aliwareint.com",
      carpeta: "andresgaibor",
    },
  ]),
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
  firmarArchivoCarpetaUsuarioGcs,
  listarCarpetaUsuarioGcs,
  listarExploradorGcs,
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
  });
  return container;
}

test("renderiza tÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­tulo Descargas", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Descargas");
});

test("renderiza nombre del reporte", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Ventas Comercial");
});

test("renderiza botÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de descarga", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Descargar archivos");
});

test("usuario final ve su carpeta GCS normalizada y sus archivos", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("byronnasimba");
  expect(vista.textContent).toContain("pruebagcp.csv");
  expect(vista.textContent).toContain("Espacio privado");
  expect(vista.textContent).toContain("Actividad reciente");
  expect(listarExploradorGcs).not.toHaveBeenCalled();
});

test("renderiza el explorador GCS para administradores", async () => {
  const vista = await montar({ modoUsuarioFinal: false, esAdmin: true });
  expect(vista.textContent).toContain("Almacenamiento de reportes");
  expect(vista.textContent).toContain("Actividad de usuarios");
  expect(vista.textContent).toContain("Ejecuciones históricas no asignadas");
  expect(vista.textContent).toContain("bkt_dwh");
  expect(vista.textContent).toContain("mini-test-000000000000.csv.gz");
  expect(vista.textContent).toContain("reportes/");
  expect(vista.textContent).toContain("andresgaibor");
  expect(vista.textContent).toContain("byronnasimba");
  expect(vista.textContent).not.toContain("byron.nasimba/");
  expect(vista.textContent).not.toContain("Usuario 44444444");
});


test("recargar conserva la subcarpeta personal indicada en la URL", async () => {
  window.history.replaceState({}, "", "/descargas?carpeta=test-bq-sftp%2F");
  await montar();
  expect(listarCarpetaUsuarioGcs).toHaveBeenCalledWith("test-bq-sftp/");
  expect(container?.textContent).toContain("test-bq-sftp");
  expect(container?.textContent).not.toContain("POCs/TalendDescargados/byronnasimba/test-bq-sftp");
});
test("descarga un archivo de la carpeta privada usando la URL firmada", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const vista = await montar();
  const boton = [...vista.querySelectorAll("button")].find(
    (elemento) => elemento.textContent?.includes("Descargar"),
  );
  expect(boton).toBeTruthy();
  await act(async () => {
    boton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await vi.waitFor(() => {
    expect(firmarArchivoCarpetaUsuarioGcs).toHaveBeenCalledWith(
      "pruebagcp.csv",
    );
    expect(click).toHaveBeenCalledOnce();
  });
  click.mockRestore();
});

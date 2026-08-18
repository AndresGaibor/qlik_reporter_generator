import { ErrorClienteApi } from "@/compartido/api/cliente";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const vista = vi.hoisted(() => ({ modoUsuarioFinal: false }));

const autenticacion = vi.hoisted(() => ({
  obtenerSesion: vi.fn(async () => ({
    tenantHost: "tenant.qlikcloud.com",
    tenantActivoId: "tenant-1",
    tenantsDisponibles: [
      { id: "tenant-1", organizacionId: "organizacion-1" },
    ] as Array<{ id: string; organizacionId: string }>,
    esSuperadmin: false,
    membresias: [] as Array<{
      organizacionId: string;
      organizacionNombre: string;
      rol: "admin" | "usuario";
    }>,
  })),
}));

const api = vi.hoisted(() => ({
  obtenerDetalleAutomatizacion: vi.fn(async () => ({
    automatizacion: {
      id: "auto-1",
      nombre: "Ventas",
      activa: true,
      puedeEjecutar: true,
      ejecucionActiva: false,
      espacioNombre: "Finanzas",
      modoEjecucion: "manual",
      modificadoEn: "2026-08-14T20:00:00Z",
    },
    ejecuciones: [],
  })),
  obtenerConfiguracionReporte: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Ventas",
    flujoIdQlik: "flujo-1",
    flujoNombreSnapshot: "Ventas Comercial",
    flujoEspacioIdQlik: "espacio-1",
    automatizacionIdQlik: "auto-1",
    automatizacionNombreSnapshot: "Ventas Automate",
    destinoGcs: "gs://bkt_dwh/POCs/TalendDescargados/",
    activa: true,
    programacion: {
      activa: true,
      expresionCron: "0 8 * * *",
      zonaHoraria: "America/Guayaquil",
      proximaEjecucionEn: "2026-08-15T13:00:00.000Z",
    },
  })),
  obtenerEjecucionesLocalesReporte: vi.fn(async () => [
    {
      id: "22222222-2222-4222-8222-222222222222",
      configuracionId: "11111111-1111-4111-8111-111111111111",
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      runIdQlik: "run-1",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "LOAD [id]; SQL SELECT id FROM `p.d.t`;",
      sqlBigQueryCompilado: "SELECT `id` FROM `p.d.t`",
      scriptExportacion: "DECLARE max_rows INT64 DEFAULT 1000000; EXPORT DATA",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
      estado: "completada",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: "2026-08-14T23:00:00.000Z",
      finalizadoEn: "2026-08-14T23:05:00.000Z",
      creadoEn: "2026-08-14T22:59:59.000Z",
    },
  ]),
  preflightDataflowReporte: vi.fn(async () => ({
    flujoIdQlik: "flujo-1",
    hashDataflowSha256: "b".repeat(64),
    compatible: true,
    operacionesNoSoportadas: [],
    sqlBigQuery: "SELECT 1",
    bytesProcesados: 1024,
    costoEstimadoUsd: 0,
    resumen: { fuentes: 2, filtros: 3, joins: 1, camposSalida: 34 },
  })),
  obtenerFlujosConFiltros: vi.fn(async () => [
    {
      id: "flujo-1",
      nombre: "Ventas Comercial",
      espacioId: "espacio-1",
      espacioNombre: "Finanzas",
    },
  ]),
  actualizarConfiguracionReporte: vi.fn(async () => ({})),
  ejecutarAutomatizacion: vi.fn(async () => ({
    runId: "run-2",
    ejecucionReporteId: "e-2",
  })),
  detenerEjecucion: vi.fn(async () => ({ detenida: true })),
  clonarAutomatizacion: vi.fn(async () => ({ id: "auto-2", nombre: "Copia" })),
  obtenerWorkspaceAutomatizacion: vi.fn(async () => ({
    id: "auto-1",
    nombre: "Ventas",
    workspace: {},
    schedules: [],
  })),
}));

vi.mock("@/modulos/reportes/api", () => api);
vi.mock("@/modulos/autenticacion/api", () => autenticacion);
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));
vi.mock("@/app/contexto-vista", () => ({
  useVistaUsuarioFinal: () => vista.modoUsuarioFinal,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => (
    <a href="/reportes">{children as never}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock(
  "@/modulos/reportes/componentes/tarjeta-detalle-automatizacion",
  () => ({
    TarjetaDetalleAutomatizacion: ({
      onEjecutar,
      mostrarWorkspace,
      ejecucionDesdePlataformaHabilitada = true,
    }: {
      onEjecutar: () => void;
      mostrarWorkspace: boolean;
      ejecucionDesdePlataformaHabilitada?: boolean;
    }) => (
      <>
        <button
          type="button"
          onClick={onEjecutar}
          disabled={!ejecucionDesdePlataformaHabilitada}
        >
          Ejecutar reporte
        </button>
        {mostrarWorkspace ? <span>Ver Script / Workspace</span> : null}
      </>
    ),
  }),
);
vi.mock("@/modulos/reportes/componentes/modal-clonar-automatizacion", () => ({
  ModalClonarAutomatizacion: () => null,
}));

import { PaginaDetalleAutomatizacion } from "./pagina-detalle-automatizacion";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vista.modoUsuarioFinal = false;
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
        <PaginaDetalleAutomatizacion id="auto-1" />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Ventas Comercial");
    expect(container?.textContent).toContain("SHA-256");
    expect(container?.textContent).toContain("Dataflow compatible");
  });
  return container;
}

test("muestra configuración Dataflow y auditoría por ejecución", async () => {
  autenticacion.obtenerSesion.mockResolvedValueOnce({
    tenantHost: "tenant.qlikcloud.com",
    tenantActivoId: "tenant-1",
    tenantsDisponibles: [{ id: "tenant-1", organizacionId: "organizacion-1" }],
    esSuperadmin: false,
    membresias: [
      {
        organizacionId: "organizacion-1",
        organizacionNombre: "Bancolombia prueba",
        rol: "admin",
      },
    ],
  });
  const vista = await montar();
  expect(vista.textContent).toContain("Dataflow actual");
  expect(vista.textContent).toContain("Dataflow compatible");
  expect(vista.textContent).toContain("gs://bkt_dwh/POCs/TalendDescargados/");
  expect(vista.textContent).toContain("34 campos");
  expect(vista.textContent).toContain("SHA-256");
  expect(vista.textContent).toContain("Script Dataflow utilizado");
  expect(vista.textContent).toContain("SQL BigQuery compilado");
  expect(vista.textContent).toContain("Script enviado a Talend");
  expect(vista.textContent).not.toContain("Tabla de datos");
  expect(vista.textContent).not.toContain("Campos incluidos");
  expect(vista.textContent).not.toContain("Periodo");
});

test("permite editar solo propiedades del reporte", async () => {
  await montar();
  const editar = Array.from(container?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent?.includes("Editar configuración"),
  );
  await act(async () => editar?.click());

  expect(container?.textContent).toContain("Cambiar Dataflow");
  expect(container?.textContent).not.toContain("gcp_script");
  expect(container?.textContent).not.toContain("Seleccionar columnas");
});

test("muestra el script de Qlik Automate únicamente al administrador", async () => {
  autenticacion.obtenerSesion.mockResolvedValueOnce({
    tenantHost: "tenant.qlikcloud.com",
    tenantActivoId: "tenant-1",
    tenantsDisponibles: [{ id: "tenant-1", organizacionId: "organizacion-1" }],
    esSuperadmin: false,
    membresias: [
      {
        organizacionId: "organizacion-1",
        organizacionNombre: "Bancolombia prueba",
        rol: "admin",
      },
    ],
  });

  const vista = await montar();

  expect(vista.textContent).toContain("Ver Script / Workspace");
});

test("oculta el script de Qlik Automate a usuarios no administradores", async () => {
  const vista = await montar();

  expect(vista.textContent).not.toContain("Ver Script / Workspace");
});

test("no muestra el workspace si el usuario es admin solo de otra organización", async () => {
  autenticacion.obtenerSesion.mockResolvedValueOnce({
    tenantHost: "tenant.qlikcloud.com",
    tenantActivoId: "tenant-2",
    tenantsDisponibles: [{ id: "tenant-2", organizacionId: "organizacion-2" }],
    esSuperadmin: false,
    membresias: [
      {
        organizacionId: "organizacion-1",
        organizacionNombre: "Otra organización",
        rol: "admin",
      },
    ],
  });

  const vista = await montar();

  expect(vista.textContent).not.toContain("Ver Script / Workspace");
});

test("oculta la auditoría técnica cuando un admin prueba Vista usuario final", async () => {
  autenticacion.obtenerSesion.mockResolvedValueOnce({
    tenantHost: "tenant.qlikcloud.com",
    tenantActivoId: "tenant-1",
    tenantsDisponibles: [{ id: "tenant-1", organizacionId: "organizacion-1" }],
    esSuperadmin: false,
    membresias: [
      {
        organizacionId: "organizacion-1",
        organizacionNombre: "Bancolombia prueba",
        rol: "admin",
      },
    ],
  });
  vista.modoUsuarioFinal = true;

  const pagina = await montar();

  expect(pagina.textContent).not.toContain("Ver Script / Workspace");
  expect(pagina.textContent).not.toContain("Ver auditoría técnica");
  expect(pagina.textContent).not.toContain("Script Dataflow utilizado");
});

test("muestra en modo consulta una automatización traída de Qlik sin configuración local", async () => {
  api.obtenerConfiguracionReporte.mockRejectedValueOnce(
    new ErrorClienteApi(
      "El reporte no tiene configuración local",
      404,
      "NO_ENCONTRADO",
    ),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <PaginaDetalleAutomatizacion id="auto-1" />
      </QueryClientProvider>,
    );
  });

  await vi.waitFor(() => {
    expect(container?.textContent).not.toContain("Cargando reporte…");
  });

  expect(container.textContent).toContain("Ventas");
  expect(container.textContent).toContain(
    "Automatización de Qlik sin configuración local",
  );
  expect(container.textContent).not.toContain("Dataflow actual");
  expect(container.textContent).not.toContain("Auditoría de ejecuciones");
  const ejecutar = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Ejecutar reporte"),
  );
  expect(ejecutar?.disabled).toBe(true);
  expect(api.obtenerEjecucionesLocalesReporte).not.toHaveBeenCalled();
  expect(api.preflightDataflowReporte).not.toHaveBeenCalled();
});

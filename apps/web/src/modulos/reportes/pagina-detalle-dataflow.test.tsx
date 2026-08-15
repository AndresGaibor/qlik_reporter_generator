import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

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
      tipoEjecucion: "manual",
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
  actualizarWorkspaceAutomatizacion: vi.fn(async () => ({})),
}));

vi.mock("@/modulos/reportes/api", () => api);
vi.mock("@/modulos/autenticacion/api", () => ({
  obtenerSesion: vi.fn(async () => ({
    tenantHost: "tenant.qlikcloud.com",
    membresias: [],
  })),
}));
vi.mock("@/compartido/componentes/feedback/notificaciones", () => ({
  useNotificaciones: () => ({ mostrarExito: vi.fn(), mostrarError: vi.fn() }),
}));
vi.mock("@/app/contexto-vista", () => ({ useVistaUsuarioFinal: () => false }));
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
    }: { onEjecutar: () => void }) => (
      <button type="button" onClick={onEjecutar}>
        Ejecutar reporte
      </button>
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
  if (root) flushSync(() => root?.unmount());
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
        <PaginaDetalleAutomatizacion id="auto-1" />
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Ventas Comercial");
    expect(container?.textContent).toContain("SHA-256");
  });
  return container;
}

test("muestra configuración Dataflow y auditoría por ejecución", async () => {
  const vista = await montar();
  expect(vista.textContent).toContain("Dataflow actual");
  expect(vista.textContent).toContain("Dataflow compatible");
  expect(vista.textContent).toContain("gs://bkt_dwh/POCs/TalendDescargados/");
  expect(vista.textContent).toContain("0 8 * * *");
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
  expect(container?.querySelector("#editar-cron-reporte")).not.toBeNull();
  expect(container?.textContent).not.toContain("gcp_script");
  expect(container?.textContent).not.toContain("Seleccionar columnas");
});

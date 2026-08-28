import type { DetalleEjecucionReporte } from "@qlik/contratos";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

const navegar = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navegar,
}));

import { HistorialAuditoriaReporte } from "./historial-auditoria-reporte";

const ejecucionBase: DetalleEjecucionReporte = {
  id: "e-1",
  organizacionId: "org-1",
  tenantQlikId: "tenant-1",
  flujoIdQlik: "flujo-1",
  flujoNombreSnapshot: "Test Flow",
  flujoEspacioIdQlik: null,
  automatizacionIdQlik: "auto-1",
  runIdQlik: "run-1",
  ejecutadoPorUsuarioId: null,
  automatizacionPersonalId: null,
  hashDataflowSha256: "a".repeat(64),
  scriptDataflow: "LOAD [id];",
  sqlBigQueryCompilado: "SELECT id FROM tabla",
  scriptExportacion: "EXPORT DATA",
  uriBaseGcs: "gs://bkt/reporte/e-1/",
  estado: "completada",
  versionCompilador: 2,
  etapaError: null,
  mensajeError: null,
  iniciadoEn: "2026-08-18T12:00:00Z",
  finalizadoEn: "2026-08-18T12:01:30Z",
  creadoEn: "2026-08-18T12:00:00Z",
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar(
  mostrarDetallesTecnicos: boolean,
  ejecucion: DetalleEjecucionReporte = ejecucionBase,
  reporteId?: string,
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HistorialAuditoriaReporte
        ejecuciones={[ejecucion]}
        mostrarDetallesTecnicos={mostrarDetallesTecnicos}
        reporteId={reporteId}
      />,
    );
  });
  return container;
}

test("oculta la auditoría técnica y la huella SHA al usuario final sin ocultar el historial", () => {
  const vista = montar(false);
  expect(vista.textContent).toContain("Auditoría de ejecuciones");
  expect(vista.textContent).toContain("gs://bkt/reporte/e-1/");
  expect(vista.textContent).not.toContain("SHA-256");
  expect(vista.textContent).not.toContain("aaaaaaaaaaaaaaaa…");
  expect(vista.textContent).not.toContain("Ver auditoría técnica");
  expect(vista.textContent).not.toContain("Script Dataflow utilizado");
  expect(vista.textContent).toContain("Tiempo transcurrido: 1 min 30 s");
});

test("Ver archivos abre el reporte y la ejecución seleccionada", () => {
  navegar.mockClear();
  const vista = montar(false, ejecucionBase, "reporte-25");
  const boton = [...vista.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("Ver archivos"),
  );

  expect(boton).toBeTruthy();
  act(() => boton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(navegar).toHaveBeenCalledWith({
    to: "/descargas",
    search: { reporte: "reporte-25", ejecucion: "e-1" },
  });
});

test("muestra el Job ID de BigQuery en el historial normal con acción de copia", () => {
  const vista = montar(false, {
    ...ejecucionBase,
    jobIdBigQuery: "bquxjob_1234567890_abcdef",
  });

  expect(vista.textContent).toContain("Job ID");
  expect(vista.textContent).toContain("bquxjob_1234567890_abcdef");
  expect(vista.querySelector('[aria-label="Copiar Job ID"]')).toBeTruthy();
  expect(vista.textContent).not.toContain("Ver auditoría técnica");
});

test("muestra los scripts técnicos sobre fondo claro al administrador", () => {
  const vista = montar(true);
  expect(vista.textContent).toContain("Ver auditoría técnica");
  expect(vista.textContent).toContain("Script Dataflow utilizado");
  const bloque = vista.querySelector("pre");
  expect(bloque?.className).toContain("bg-surface");
  expect(bloque?.className).not.toContain("bg-slate-950");
});

test("muestra métricas BigQuery y controles de copia en auditoría técnica", () => {
  const ejecucionConBigQuery: DetalleEjecucionReporte = {
    ...ejecucionBase,
    jobIdBigQuery: "job-xyz-789",
    bigQueryProjectId: "my-project",
    bigQueryLocation: "us-central1",
    metricas: {
      duracionTotalMs: 90000,
      duracionBigQueryMs: 45000,
      totalBytesProcessed: "4096",
      totalBytesBilled: "2048",
      totalSlotMs: "1024",
    },
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <HistorialAuditoriaReporte
        ejecuciones={[ejecucionConBigQuery]}
        mostrarDetallesTecnicos={true}
      />,
    );
  });
  const texto = container.textContent ?? "";
  expect(texto).toContain("45 s");
  expect(texto).toContain("4 KB");
  expect(texto).toContain("job-xyz-789");
  expect(texto).toContain("my-project");
  expect(texto).toContain("us-central1");
  expect(texto).toContain("Copiar");
  act(() => root.unmount());
  container.remove();
});

test("prioriza la duración verificada y presenta errores duplicados de Talend de forma accionable", () => {
  const ejecucionConError: DetalleEjecucionReporte = {
    ...ejecucionBase,
    estado: "error",
    creadoEn: "2026-08-26T12:00:00Z",
    iniciadoEn: "2026-08-26T17:04:51Z",
    finalizadoEn: "2026-08-26T17:05:14Z",
    etapaError: "talend",
    mensajeError: "Talend terminó con HTTP 409 duplicate para el job_id por defecto.",
    metricas: {
      duracionTotalMs: 22578,
      duracionBigQueryMs: 17676,
      totalBytesProcessed: null,
      totalBytesBilled: null,
      totalSlotMs: null,
    },
  };
  const vista = document.createElement("div");
  document.body.append(vista);
  const root = createRoot(vista);
  act(() => {
    root.render(
      <HistorialAuditoriaReporte
        ejecuciones={[ejecucionConError]}
        mostrarDetallesTecnicos={false}
      />,
    );
  });

  expect(vista.textContent).toContain("Tiempo transcurrido: 22 s");
  expect(vista.textContent).toContain("BigQuery: 17 s");
  expect(vista.textContent).toContain(
    "La exportación no pudo iniciarse porque ya existe una solicitud con el mismo identificador. Intenta nuevamente en unos minutos.",
  );
  expect(vista.textContent).not.toContain("Talend terminó");
  expect(vista.textContent).not.toContain("HTTP 409");

  act(() => root.unmount());
  vista.remove();
});

test("oculta métricas BigQuery cuando no hay metadata", () => {
  const ejecucionSinBigQuery: DetalleEjecucionReporte = {
    ...ejecucionBase,
    jobIdBigQuery: undefined,
    bigQueryProjectId: undefined,
    bigQueryLocation: undefined,
    metricas: undefined,
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <HistorialAuditoriaReporte
        ejecuciones={[ejecucionSinBigQuery]}
        mostrarDetallesTecnicos={true}
      />,
    );
  });
  const texto = container.textContent ?? "";
  expect(texto).not.toContain("job-xyz");
  expect(texto).not.toContain("Copiar job");
  expect(texto).not.toContain("Copiar run");
  act(() => root.unmount());
  container.remove();
});

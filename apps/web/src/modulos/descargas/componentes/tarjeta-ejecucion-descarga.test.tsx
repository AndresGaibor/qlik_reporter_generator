import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { TarjetaEjecucionDescarga } from "./tarjeta-ejecucion-descarga";

const base: ResumenDescargaEjecucion = {
  id: "11111111-1111-4111-8111-111111111111",
  flujoIdQlik: "flujo-1",
  reporteNombre: "Test_BQ_SFTP",
  automatizacionIdQlik: "auto-1",
  estado: "completada",
  mensajeError: null,
  creadoEn: "2026-08-19T10:00:00.000Z",
  finalizadoEn: "2026-08-19T10:01:30.000Z",
  archivos: [],
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderizar(ejecucion: ResumenDescargaEjecucion) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <TarjetaEjecucionDescarga
        ejecucion={ejecucion}
        estadoDescarga="idle"
        progreso={0}
        porcentaje={0}
        bytesDescargados={0}
        totalBytes={0}
        totalArchivos={0}
        archivoActual=""
        error={null}
        onDescargar={vi.fn()}
        onDescargarArchivo={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );
  });
  return container;
}

function renderizarStatic(ejecucion: ResumenDescargaEjecucion) {
  return renderToStaticMarkup(
    <TarjetaEjecucionDescarga
      ejecucion={ejecucion}
      estadoDescarga="idle"
      progreso={0}
      porcentaje={0}
      bytesDescargados={0}
      totalBytes={0}
      totalArchivos={0}
      archivoActual=""
      error={null}
      onDescargar={vi.fn()}
      onDescargarArchivo={vi.fn()}
      onCancelar={vi.fn()}
    />,
  );
}

test("ejecución activa informa que aún no hay archivos y no ofrece descarga", () => {
  const html = renderizarStatic({
    ...base,
    estado: "iniciada",
    finalizadoEn: null,
  });
  expect(html).toContain("En proceso");
  expect(html).toContain("Archivos todavía no disponibles");
  expect(html).not.toContain("Descargar archivos");
});

test("ejecución completada resume archivos, tamaño total y duración real", () => {
  const html = renderizarStatic({
    ...base,
    creadoEn: "2026-08-19T05:00:00.000Z",
    finalizadoEn: "2026-08-19T10:01:30.000Z",
    duracionTotalMs: 90000,
    archivos: [
      { nombre: "a.csv", formato: "CSV", tamano: 1024, fecha: null },
      { nombre: "b.csv", formato: "CSV", tamano: 2048, fecha: null },
    ],
  });
  expect(html).toContain("2 archivos");
  expect(html).toContain("3 KB");
  expect(html).toContain("1 min 30 s");
  expect(html).not.toContain("300 min");
  expect(html).toContain("Descargar archivos");
});

test("ejecución completada con metadata BigQuery muestra métricas de síntesis", () => {
  const html = renderizarStatic({
    ...base,
    archivos: [{ nombre: "a.csv", formato: "CSV", tamano: 1024, fecha: null }],
    duracionTotalMs: 90000,
    duracionBigQueryMs: 45000,
    totalBytesProcessed: "4096",
    totalBytesBilled: "2048",
    totalSlotMs: "1024",
    jobIdBigQuery: "job-abc123",
    runIdQlik: "run-xyz-456",
    ejecucionId: "22222222-2222-4222-8222-222222222222",
  });
  expect(html).toContain("45 s");
  expect(html).toContain("4 KB");
  expect(html).toContain("Detalles técnicos");
});

test("ejecución completada con metadata BigQuery revela IDs copiables al expandir", () => {
  const vista = renderizar({
    ...base,
    archivos: [{ nombre: "a.csv", formato: "CSV", tamano: 1024, fecha: null }],
    duracionBigQueryMs: 45000,
    totalBytesProcessed: "4096",
    jobIdBigQuery: "job-abc123",
    runIdQlik: "run-xyz-456",
    ejecucionId: "22222222-2222-4222-8222-222222222222",
  });
  const boton = vista.querySelector("button");
  act(() => {
    boton?.click();
  });
  const texto = vista.textContent ?? "";
  expect(texto).toContain("job-abc123");
  expect(texto).toContain("run-xyz-456");
  expect(texto).toContain("22222222-2222-4222-8222-222222222222");
  expect(texto).toContain("Copiar");
});

test("ejecución completada sin metadata BigQuery no muestra campos de BigQuery", () => {
  const html = renderizarStatic({
    ...base,
    archivos: [{ nombre: "a.csv", formato: "CSV", tamano: 512, fecha: null }],
    duracionTotalMs: 30000,
    duracionBigQueryMs: null,
    totalBytesProcessed: null,
    totalBytesBilled: null,
    totalSlotMs: null,
    jobIdBigQuery: null,
    runIdQlik: null,
    ejecucionId: null,
  });
  expect(html).toContain("30 s");
  expect(html).toContain("512 B");
  expect(html).not.toContain("Detalles técnicos");
});

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { HistorialAuditoriaReporte } from "./historial-auditoria-reporte";

const ejecucion = {
  id: "e-1",
  hashDataflowSha256: "a".repeat(64),
  scriptDataflow: "LOAD [id];",
  sqlBigQueryCompilado: "SELECT id FROM tabla",
  scriptExportacion: "EXPORT DATA",
  uriBaseGcs: "gs://bkt/reporte/e-1/",
  estado: "completada",
  versionCompilador: 2,
  runIdQlik: "run-1",
  iniciadoEn: "2026-08-18T12:00:00Z",
  finalizadoEn: "2026-08-18T12:01:30Z",
  creadoEn: "2026-08-18T12:00:00Z",
} as never;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function montar(mostrarDetallesTecnicos: boolean) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HistorialAuditoriaReporte
        ejecuciones={[ejecucion]}
        mostrarDetallesTecnicos={mostrarDetallesTecnicos}
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

test("muestra los scripts técnicos sobre fondo claro al administrador", () => {
  const vista = montar(true);
  expect(vista.textContent).toContain("Ver auditoría técnica");
  expect(vista.textContent).toContain("Script Dataflow utilizado");
  const bloque = vista.querySelector("pre");
  expect(bloque?.className).toContain("bg-surface");
  expect(bloque?.className).not.toContain("bg-slate-950");
});

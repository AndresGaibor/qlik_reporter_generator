import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
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

function renderizar(ejecucion: ResumenDescargaEjecucion) {
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
  const html = renderizar({ ...base, estado: "iniciada", finalizadoEn: null });
  expect(html).toContain("En proceso");
  expect(html).toContain("Archivos todavía no disponibles");
  expect(html).not.toContain("Descargar archivos");
});

test("ejecución completada resume archivos, tamaño total y duración", () => {
  const html = renderizar({
    ...base,
    archivos: [
      { nombre: "a.csv", formato: "CSV", tamano: 1024, fecha: null },
      { nombre: "b.csv", formato: "CSV", tamano: 2048, fecha: null },
    ],
  });
  expect(html).toContain("2 archivos");
  expect(html).toContain("3 KB");
  expect(html).toContain("1 min 30 s");
  expect(html).toContain("Descargar archivos");
});

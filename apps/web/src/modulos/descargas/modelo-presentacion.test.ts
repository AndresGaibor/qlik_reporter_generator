import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { describe, expect, it } from "vitest";
import {
  agruparEjecucionesPorReporte,
  presentarNombreArchivo,
} from "./modelo-presentacion";

function ejecucion(
  parcial: Partial<ResumenDescargaEjecucion>,
): ResumenDescargaEjecucion {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    flujoIdQlik: "flujo-1",
    reporteNombre: "Reporte",
    automatizacionIdQlik: "auto-1",
    estado: "completada",
    mensajeError: null,
    creadoEn: "2026-08-26T16:26:00.000Z",
    finalizadoEn: null,
    archivos: [],
    ...parcial,
  };
}

describe("modelo de presentación de descargas", () => {
  it("agrupa por flujo y ordena reportes y ejecuciones por actividad", () => {
    const resultado = agruparEjecucionesPorReporte([
      ejecucion({
        id: "00000000-0000-4000-8000-000000000002",
        flujoIdQlik: "flujo-2",
        reporteNombre: "Ventas",
        creadoEn: "2026-08-25T10:00:00.000Z",
      }),
      ejecucion({
        id: "00000000-0000-4000-8000-000000000003",
        creadoEn: "2026-08-27T10:00:00.000Z",
      }),
      ejecucion({
        id: "00000000-0000-4000-8000-000000000004",
        creadoEn: "2026-08-26T10:00:00.000Z",
      }),
    ]);

    expect(resultado.map((reporte) => reporte.nombre)).toEqual([
      "Reporte",
      "Ventas",
    ]);
    expect(resultado[0]?.ejecuciones.map((item) => item.creadoEn)).toEqual([
      "2026-08-27T10:00:00.000Z",
      "2026-08-26T10:00:00.000Z",
    ]);
  });

  it("presenta partes técnicas con una numeración comprensible", () => {
    expect(presentarNombreArchivo("parte-000000000003.csv", 3, 8)).toBe(
      "Parte 4 de 8",
    );
    expect(presentarNombreArchivo("resultado-final.csv", 0, 1)).toBe(
      "resultado-final.csv",
    );
  });
});

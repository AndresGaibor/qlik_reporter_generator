import { describe, expect, it } from "vitest";
import {
  detectarCamposFecha,
  formatearBytes,
  formatearCostoUsd,
  humanizarNombreTabla,
  obtenerRequisitoPendiente,
  seleccionarCamposIniciales,
} from "./utiles-creador-reporte";

const columnas = [
  { nombre: "Venta_Neta_USD", tipo: "NUMERIC" },
  { nombre: "Fecha", tipo: "DATE" },
  { nombre: "cliente_id", tipo: "STRING" },
  ...Array.from({ length: 20 }, (_, indice) => ({
    nombre: `campo_${indice}`,
    tipo: "STRING",
  })),
];

describe("reglas del creador de reportes", () => {
  it("prioriza fechas e identificadores y limita la selección inicial", () => {
    const seleccion = seleccionarCamposIniciales(columnas, 12);
    expect(seleccion).toHaveLength(12);
    expect(seleccion.slice(0, 2)).toEqual(["Fecha", "cliente_id"]);
  });

  it("detecta columnas compatibles con periodos", () => {
    expect(detectarCamposFecha(columnas)).toEqual(["Fecha"]);
  });
  it("formatea costo y volumen en unidades humanas", () => {
    expect(formatearCostoUsd(0.01523781)).toBe("$0,02 USD");
    expect(formatearBytes(2_680_000_000)).toBe("2,50 GB");
  });

  it("explica el primer requisito pendiente", () => {
    expect(
      obtenerRequisitoPendiente({
        tabla: "ventas",
        campoFecha: "Fecha",
        columnas: ["Fecha"],
      }),
    ).toBe("Selecciona un periodo para crear el reporte.");
    expect(
      obtenerRequisitoPendiente({
        tabla: "ventas",
        campoFecha: "Fecha",
        fechaDesde: new Date(2026, 5, 1),
        fechaHasta: new Date(2026, 5, 30),
        columnas: ["Fecha"],
      }),
    ).toBeNull();
  });

  it("convierte identificadores técnicos en nombres editables", () => {
    expect(humanizarNombreTabla("VENTAS_COMERCIAL_DIARIAS_D")).toBe(
      "Ventas comercial diarias",
    );
  });
});
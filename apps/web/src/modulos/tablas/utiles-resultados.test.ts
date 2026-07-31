import { describe, expect, it } from "vitest";
import {
  filtrarRecursos,
  formatearFechaResultado,
  formatearValorResultado,
  obtenerColumnasPreview,
} from "./utiles-resultados";

const recursos = [
  { id: "ventas", nombre: "Ventas Mensuales", tipo: "tabla" as const, metadatos: {} },
  { id: "clientes", nombre: "CLIENTES_ACTIVOS", tipo: "tabla" as const, metadatos: {} },
];

describe("utilidades del catálogo BigQuery", () => {
  it("filtra por nombre o identificador sin distinguir mayúsculas", () => {
    expect(filtrarRecursos(recursos, "clientes")).toEqual([recursos[1]]);
    expect(filtrarRecursos(recursos, "VENTAS")).toEqual([recursos[0]]);
  });

  it("conserva el orden de columnas según su primera aparición", () => {
    const filas = [{ id: 1, nombre: "Ana" }, { nombre: "Luis", ciudad: "Quito" }];
    expect(obtenerColumnasPreview(filas)).toEqual(["id", "nombre", "ciudad"]);
  });

  it("presenta null, objetos y valores primitivos de forma segura", () => {
    expect(formatearValorResultado(null)).toBe("—");
    expect(formatearValorResultado({ value: "2026-07-31" })).toBe("2026-07-31");
    expect(formatearValorResultado({ activo: true })).toBe('{"activo":true}');
    expect(formatearValorResultado(42)).toBe("42");
  });

  it("evita mostrar fechas inválidas", () => {
    expect(formatearFechaResultado("fecha-invalida")).toBe("—");
    expect(formatearFechaResultado(undefined)).toBe("—");
  });
});

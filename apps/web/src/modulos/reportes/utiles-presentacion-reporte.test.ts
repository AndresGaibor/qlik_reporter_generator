import { describe, expect, test } from "vitest";
import {
  abreviarIdEjecucion,
  calcularDuracion,
  extraerMensajeError,
  presentarEstadoEjecucion,
} from "./utiles-presentacion-reporte";

describe("presentación operativa del reporte", () => {
  test("traduce los estados técnicos y asigna su tono", () => {
    expect(presentarEstadoEjecucion("finished")).toEqual({
      etiqueta: "Completada",
      tono: "exito",
      enCurso: false,
    });
    expect(presentarEstadoEjecucion("running")).toEqual({
      etiqueta: "En ejecución",
      tono: "progreso",
      enCurso: true,
    });
    expect(presentarEstadoEjecucion("failed").etiqueta).toBe("Fallida");
  });

  test("calcula una duración legible", () => {
    expect(
      calcularDuracion("2026-07-30T10:00:00.000Z", "2026-07-30T10:01:30.000Z"),
    ).toBe("1 min 30 s");
  });
});

describe("identificadores y errores", () => {
  test("abrevia identificadores largos sin perder sus extremos", () => {
    expect(abreviarIdEjecucion("12345678-1234-1234-1234-123456789abc")).toBe(
      "12345678…789abc",
    );
    expect(abreviarIdEjecucion("run-123")).toBe("run-123");
  });

  test("extrae mensajes útiles desde respuestas heterogéneas", () => {
    expect(extraerMensajeError("Conexión rechazada")).toBe(
      "Conexión rechazada",
    );
    expect(extraerMensajeError({ message: "Credenciales inválidas" })).toBe(
      "Credenciales inválidas",
    );
    expect(extraerMensajeError({ error: { message: "Tiempo agotado" } })).toBe(
      "Tiempo agotado",
    );
    expect(extraerMensajeError(undefined)).toBeNull();
  });
});

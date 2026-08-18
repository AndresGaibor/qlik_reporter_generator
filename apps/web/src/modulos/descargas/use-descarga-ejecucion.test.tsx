import { describe, expect, it } from "vitest";
import {
  esEstadoActivo,
  formatearFechaISO,
  formatearTamano,
  presentarEjecucion,
} from "./presentacion-ejecucion";

describe("presentacion-ejecucion", () => {
  describe("presentarEjecucion", () => {
    it("presenta estado preparando", () => {
      const resultado = presentarEjecucion({
        id: "1",
        reporteNombre: "Test",
        automatizacionIdQlik: "auto-1",
        estado: "preparando",
        mensajeError: null,
        creadoEn: "2026-08-15T10:00:00Z",
        finalizadoEn: null,
        archivos: [],
      });
      expect(resultado.tipo).toBe("preparando");
    });

    it("presenta estado iniciada", () => {
      const resultado = presentarEjecucion({
        id: "1",
        reporteNombre: "Test",
        automatizacionIdQlik: "auto-1",
        estado: "iniciada",
        mensajeError: null,
        creadoEn: "2026-08-15T10:00:00Z",
        finalizadoEn: null,
        archivos: [],
      });
      expect(resultado.tipo).toBe("iniciada");
    });

    it("presenta estado completada", () => {
      const resultado = presentarEjecucion({
        id: "1",
        reporteNombre: "Test",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        creadoEn: "2026-08-15T10:00:00Z",
        finalizadoEn: "2026-08-15T10:01:00Z",
        archivos: [],
      });
      expect(resultado.tipo).toBe("completada");
    });

    it("presenta estado error con mensaje", () => {
      const resultado = presentarEjecucion({
        id: "1",
        reporteNombre: "Test",
        automatizacionIdQlik: "auto-1",
        estado: "error",
        mensajeError: "Error de conexión",
        creadoEn: "2026-08-15T10:00:00Z",
        finalizadoEn: "2026-08-15T10:01:00Z",
        archivos: [],
      });
      expect(resultado.tipo).toBe("error");
      if (resultado.tipo === "error") {
        expect(resultado.mensaje).toBe("Error de conexión");
      }
    });

    it("presenta estado detenida", () => {
      const resultado = presentarEjecucion({
        id: "1",
        reporteNombre: "Test",
        automatizacionIdQlik: "auto-1",
        estado: "detenida",
        mensajeError: null,
        creadoEn: "2026-08-15T10:00:00Z",
        finalizadoEn: "2026-08-15T10:01:00Z",
        archivos: [],
      });
      expect(resultado.tipo).toBe("detenida");
    });
  });

  describe("esEstadoActivo", () => {
    it("retorna true para preparando", () => {
      expect(esEstadoActivo("preparando")).toBe(true);
    });

    it("retorna true para iniciada", () => {
      expect(esEstadoActivo("iniciada")).toBe(true);
    });

    it("retorna false para completada", () => {
      expect(esEstadoActivo("completada")).toBe(false);
    });

    it("retorna false para error", () => {
      expect(esEstadoActivo("error")).toBe(false);
    });

    it("retorna false para detenida", () => {
      expect(esEstadoActivo("detenida")).toBe(false);
    });
  });

  describe("formatearFechaISO", () => {
    it("formatea fecha correctamente", () => {
      const resultado = formatearFechaISO("2026-08-15T10:00:00Z");
      expect(resultado).toContain("2026");
    });
  });

  describe("formatearTamano", () => {
    it("formatea bytes a B", () => {
      expect(formatearTamano(500)).toBe("500 B");
    });

    it("formatea bytes a KB", () => {
      expect(formatearTamano(1024)).toContain("KB");
    });

    it("formatea bytes a MB", () => {
      expect(formatearTamano(1048576)).toContain("MB");
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  esquemaCompartirDescarga,
  esquemaResumenDescargaEjecucion,
} from "./index.js";

const descargaBaseValida = {
  id: "d5f3a111-1111-1111-1111-111111111111",
  flujoIdQlik: "df-1",
  creadoPorUsuarioId: "a2b3c444-4444-4444-4444-444444444444",
  propietarioCorreo: "usuario@empresa.com",
  reporteNombre: "Ventas",
  automatizacionIdQlik: "auto-1",
  estado: "completada",
  mensajeError: null,
  creadoEn: "2026-08-20T10:00:00.000Z",
  finalizadoEn: "2026-08-20T10:05:00.000Z",
  archivos: [],
};

describe("contratos de descargas", () => {
  it("valida los destinatarios del compartido", () => {
    expect(
      esquemaCompartirDescarga.safeParse({
        todaOrganizacion: false,
        usuarios: ["33333333-3333-4333-8333-333333333333"],
      }).success,
    ).toBe(true);
    expect(
      esquemaCompartirDescarga.safeParse({
        todaOrganizacion: false,
        usuarios: ["no-es-uuid"],
      }).success,
    ).toBe(false);
  });

  describe("campos de trazabilidad en resumen descarga", () => {
    it("acepta ejecucionId adicional como campo propio", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        ejecucionId: "d5f3a111-1111-1111-1111-111111111111",
      });
      expect(resultado.success).toBe(true);
    });

    it("acepta jobIdBigQuery y runIdQlik nulos cuando no hay ejecucion BigQuery", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        jobIdBigQuery: null,
        runIdQlik: null,
      });
      expect(resultado.success).toBe(true);
    });

    it("acepta jobIdBigQuery y runIdQlik con valores cuando hay ejecucion activa", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        jobIdBigQuery: "job-bq-123",
        runIdQlik: "run-qlik-456",
      });
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.jobIdBigQuery).toBe("job-bq-123");
        expect(resultado.data.runIdQlik).toBe("run-qlik-456");
      }
    });

    it("acepta metricas de duracion y bytes como strings para precision", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        duracionTotalMs: 300000,
        duracionBigQueryMs: 250000,
        totalBytesProcessed: "99999999999999999999",
        totalBytesBilled: "123456789012345",
        totalSlotMs: "9876543210",
      });
      expect(resultado.success).toBe(true);
    });

    it(" Rechaza totalBytesProcessed como number (debe ser string)", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        totalBytesProcessed: 123456 as unknown as string,
      });
      expect(resultado.success).toBe(false);
    });

    it("acepta archivosExistentes booleano true cuando hay archivos", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        archivosExistentes: true,
      });
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.archivosExistentes).toBe(true);
      }
    });

    it("acepta archivosExistentes false cuando no hay archivos", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        archivosExistentes: false,
      });
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.archivosExistentes).toBe(false);
      }
    });

    it(" Rechaza metadataJson en la respuesta (no se expone raw)", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        metadataJson: { raw: "data" },
      });
      expect(resultado.success).toBe(false);
    });

    it("acepta null en metricas cuando no hay datos BigQuery", () => {
      const resultado = esquemaResumenDescargaEjecucion.safeParse({
        ...descargaBaseValida,
        jobIdBigQuery: null,
        runIdQlik: null,
        duracionTotalMs: null,
        duracionBigQueryMs: null,
        totalBytesProcessed: null,
        totalBytesBilled: null,
        totalSlotMs: null,
      });
      expect(resultado.success).toBe(true);
    });
  });
});

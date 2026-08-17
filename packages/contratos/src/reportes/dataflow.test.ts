import { describe, expect, it } from "bun:test";
import {
  esquemaActualizarConfiguracionReporte,
  esquemaConfiguracionReporteDataflow,
  esquemaDetalleEjecucionReporte,
  esquemaPreflightDataflowReporte,
} from "./dataflow.js";

describe("contratos de reportes Dataflow", () => {
  it("exige que tipoEjecucion sea solo manual", () => {
    expect(
      esquemaDetalleEjecucionReporte.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        configuracionId: "22222222-2222-4222-8222-222222222222",
        flujoIdQlik: "flujo-1",
        automatizacionIdQlik: "auto-1",
        runIdQlik: null,
        hashDataflowSha256: "a".repeat(64),
        scriptDataflow: "SELECT 1",
        sqlBigQueryCompilado: "SELECT 1",
        scriptExportacion: "EXPORT DATA",
        uriBaseGcs: "gs://bkt/test/",
        tipoEjecucion: "programada",
        estado: "preparando",
        versionCompilador: 1,
        etapaError: null,
        mensajeError: null,
        iniciadoEn: null,
        finalizadoEn: null,
        creadoEn: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });

  it("ConfiguracionReporteDataflow no tiene programacion", () => {
    expect(
      esquemaConfiguracionReporteDataflow.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        nombre: "Ventas",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Ventas DF",
        flujoEspacioIdQlik: null,
        automatizacionIdQlik: "auto-1",
        automatizacionNombreSnapshot: "Ventas",
        destinoGcs: "gs://bkt/test/",
        activa: true,
        programacion: {
          activa: true,
          expresionCron: "0 8 * * *",
          zonaHoraria: "America/Guayaquil",
          proximaEjecucionEn: new Date().toISOString(),
        },
      }).success,
    ).toBe(false);
  });

  it("exige una huella SHA-256 válida en preflight", () => {
    expect(() =>
      esquemaPreflightDataflowReporte.parse({
        flujoIdQlik: "flujo-1",
        hashDataflowSha256: "abc",
        compatible: true,
        operacionesNoSoportadas: [],
        sqlBigQuery: "SELECT 1",
        bytesProcesados: 0,
        costoEstimadoUsd: 0,
        resumen: { fuentes: 1, filtros: 0, joins: 0, camposSalida: 1 },
      }),
    ).toThrow();
  });

  it("limita la edición a propiedades del reporte sin programacion", () => {
    expect(
      esquemaActualizarConfiguracionReporte.parse({
        nombre: "Ventas v2",
        flujoIdQlik: "flujo-2",
        activa: true,
      }),
    ).toMatchObject({ flujoIdQlik: "flujo-2", activa: true });

    for (const prohibido of [
      "sqlBigQuery",
      "columnas",
      "fechaDesde",
      "gcp_script",
      "workspace",
      "programacion",
    ]) {
      expect(() =>
        esquemaActualizarConfiguracionReporte.parse({
          [prohibido]: "no permitido",
        }),
      ).toThrow();
    }
  });
});

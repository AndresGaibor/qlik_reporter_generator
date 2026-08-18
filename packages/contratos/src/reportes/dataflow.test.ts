import { describe, expect, it } from "bun:test";
import type { DetalleReporte, ResumenReporte } from "./dataflow.js";
import {
  esquemaActualizarConfiguracionReporte,
  esquemaConfiguracionReporteDataflow,
  esquemaCrearReporte,
  esquemaDetalleEjecucionReporte,
  esquemaPreflightDataflowReporte,
  esquemaResumenReporte,
  esquemaDetalleReporte,
} from "./dataflow.js";

describe("contratos de reportes Dataflow", () => {
  it("no expone tipoEjecucion desde que solo existen ejecuciones manuales", () => {
    expect(esquemaDetalleEjecucionReporte.shape).not.toHaveProperty(
      "tipoEjecucion",
    );
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

  it("rechaza cada propiedad propia de Automate por separado", () => {
    const reporteValido = {
      id: crypto.randomUUID(),
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas DF",
      flujoEspacioIdQlik: null,
      destinoGcs: "gs://bucket/",
      activa: true,
      creadoPorUsuarioId: crypto.randomUUID(),
    };

    for (const propiedad of [
      "automatizacionIdQlik",
      "automatizacionNombreSnapshot",
      "programacion",
    ]) {
      expect(() => esquemaConfiguracionReporteDataflow.parse({
        ...reporteValido,
        [propiedad]: propiedad === "automatizacionIdQlik"
          ? "legacy-auto"
          : propiedad === "automatizacionNombreSnapshot"
            ? "Legacy Automate"
            : {},
      })).toThrow();
    }
  });

  it("crea reportes sin referencias a Automate", () => {
    expect(esquemaCrearReporte.parse({
      nombre: " Ventas ", flujoIdQlik: " df-1 ",
      espacioIdQlik: " space-1 ",
    })).toEqual({
      nombre: "Ventas", flujoIdQlik: "df-1", espacioIdQlik: "space-1",
    });
  });

  it("audita usuario y automatización personal en cada ejecución", () => {
    const detalle = esquemaDetalleEjecucionReporte.parse({
      id: "11111111-1111-4111-8111-111111111111",
      reporteId: "22222222-2222-4222-8222-222222222222",
      flujoIdQlik: "df-1",
      automatizacionIdQlik: "legacy-auto",
      runIdQlik: null,
      ejecutadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
      automatizacionPersonalId: null,
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "export",
      uriBaseGcs: "gs://bucket/ejecucion/",
      estado: "preparando",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: null,
      finalizadoEn: null,
      creadoEn: "2026-08-18T12:00:00.000Z",
    });

    expect(detalle.reporteId).toBe("22222222-2222-4222-8222-222222222222");
    expect(detalle.ejecutadoPorUsuarioId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(detalle.automatizacionPersonalId).toBeNull();
    expect(detalle.automatizacionIdQlik).toBe("legacy-auto");

    const ejecucionHistorica = esquemaDetalleEjecucionReporte.parse({
      ...detalle,
      ejecutadoPorUsuarioId: null,
    });
    expect(ejecucionHistorica.ejecutadoPorUsuarioId).toBeNull();
    expect(() => esquemaDetalleEjecucionReporte.parse({
      ...detalle,
      automatizacionPersonalId: "not-a-uuid",
    })).toThrow();
  });

  it("rechaza un reporteId que no sea UUID", () => {
    expect(() => esquemaDetalleEjecucionReporte.parse({
      id: "11111111-1111-4111-8111-111111111111",
      reporteId: "reporte-invalido",
      flujoIdQlik: "df-1",
      automatizacionIdQlik: "legacy-auto",
      runIdQlik: null,
      ejecutadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
      automatizacionPersonalId: null,
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "export",
      uriBaseGcs: "gs://bucket/ejecucion/",
      estado: "preparando",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: null,
      finalizadoEn: null,
      creadoEn: "2026-08-18T12:00:00.000Z",
    })).toThrow();
  });

  it("rechaza un ejecutadoPorUsuarioId que no sea UUID", () => {
    expect(() => esquemaDetalleEjecucionReporte.parse({
      id: "11111111-1111-4111-8111-111111111111",
      reporteId: "22222222-2222-4222-8222-222222222222",
      flujoIdQlik: "df-1",
      automatizacionIdQlik: "legacy-auto",
      runIdQlik: null,
      ejecutadoPorUsuarioId: "usuario-invalido",
      automatizacionPersonalId: null,
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "export",
      uriBaseGcs: "gs://bucket/ejecucion/",
      estado: "preparando",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: null,
      finalizadoEn: null,
      creadoEn: "2026-08-18T12:00:00.000Z",
    })).toThrow();
  });

  it("acepta una automatización personal UUID no nula", () => {
    const resultado = esquemaDetalleEjecucionReporte.parse({
      id: "11111111-1111-4111-8111-111111111111",
      reporteId: "22222222-2222-4222-8222-222222222222",
      flujoIdQlik: "df-1",
      automatizacionIdQlik: "legacy-auto",
      runIdQlik: null,
      ejecutadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
      automatizacionPersonalId: "44444444-4444-4444-8444-444444444444",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "export",
      uriBaseGcs: "gs://bucket/ejecucion/",
      estado: "preparando",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: null,
      finalizadoEn: null,
      creadoEn: "2026-08-18T12:00:00.000Z",
    });

    expect(resultado.automatizacionPersonalId).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("exige automatizacionIdQlik como snapshot histórico", () => {
    expect(() => esquemaDetalleEjecucionReporte.parse({
      id: "11111111-1111-4111-8111-111111111111",
      reporteId: "22222222-2222-4222-8222-222222222222",
      flujoIdQlik: "df-1",
      runIdQlik: null,
      ejecutadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
      automatizacionPersonalId: null,
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "export",
      uriBaseGcs: "gs://bucket/ejecucion/",
      estado: "preparando",
      versionCompilador: 1,
      etapaError: null,
      mensajeError: null,
      iniciadoEn: null,
      finalizadoEn: null,
      creadoEn: "2026-08-18T12:00:00.000Z",
    })).toThrow();
  });

  it("expone los contratos públicos de resumen y detalle de reporte", () => {
    const resumen: ResumenReporte = {
      id: crypto.randomUUID(),
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas DF",
      flujoEspacioIdQlik: null,
      destinoGcs: "gs://bucket/",
      activa: true,
      creadoPorUsuarioId: crypto.randomUUID(),
    };
    const detalle: DetalleReporte = esquemaDetalleReporte.parse(
      esquemaResumenReporte.parse(resumen),
    );

    expect(detalle).toEqual(resumen);
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

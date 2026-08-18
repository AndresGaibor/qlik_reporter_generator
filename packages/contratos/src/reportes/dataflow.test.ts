import { describe, expect, it } from "bun:test";
import {
  esquemaActualizarConfiguracionReporte,
  esquemaConfiguracionReporteDataflow,
  esquemaCrearReporte,
  esquemaDetalleEjecucionReporte,
  esquemaPreflightDataflowReporte,
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

  it("rechaza propiedad de Automate en reportes", () => {
    expect(() =>
      esquemaConfiguracionReporteDataflow.parse({
        id: crypto.randomUUID(), nombre: "Ventas", flujoIdQlik: "df-1",
        flujoNombreSnapshot: "Ventas DF", flujoEspacioIdQlik: null,
        automatizacionIdQlik: "legacy-auto",
        automatizacionNombreSnapshot: "Legacy Automate",
        destinoGcs: "gs://bucket/",
        activa: true,
        creadoPorUsuarioId: crypto.randomUUID(),
      }),
    ).toThrow();
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
    expect(esquemaDetalleEjecucionReporte.shape).toHaveProperty(
      "reporteId",
    );
    expect(esquemaDetalleEjecucionReporte.shape).toHaveProperty(
      "ejecutadoPorUsuarioId",
    );
    expect(esquemaDetalleEjecucionReporte.shape).toHaveProperty(
      "automatizacionPersonalId",
    );
    expect(esquemaDetalleEjecucionReporte.shape).not.toHaveProperty(
      "configuracionId",
    );
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

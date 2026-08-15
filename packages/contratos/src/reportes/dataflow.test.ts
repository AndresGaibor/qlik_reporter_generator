import { describe, expect, it } from "bun:test";
import {
  esquemaActualizarConfiguracionReporte,
  esquemaPreflightDataflowReporte,
  esquemaProgramacionReporte,
} from "./dataflow.js";

describe("contratos de reportes Dataflow", () => {
  it("valida una programación cron con zona horaria", () => {
    const resultado = esquemaProgramacionReporte.parse({
      activa: true,
      expresionCron: "0 8 * * *",
    });
    expect(resultado.zonaHoraria).toBe("America/Guayaquil");
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

  it("limita la edición a propiedades del reporte", () => {
    expect(
      esquemaActualizarConfiguracionReporte.parse({
        nombre: "Ventas v2",
        flujoIdQlik: "flujo-2",
        programacion: {
          activa: true,
          expresionCron: "0 9 * * *",
          zonaHoraria: "America/Guayaquil",
        },
        activa: true,
      }),
    ).toMatchObject({ flujoIdQlik: "flujo-2", activa: true });

    for (const prohibido of [
      "sqlBigQuery",
      "columnas",
      "fechaDesde",
      "gcp_script",
      "workspace",
    ]) {
      expect(() =>
        esquemaActualizarConfiguracionReporte.parse({
          [prohibido]: "no permitido",
        }),
      ).toThrow();
    }
  });
});

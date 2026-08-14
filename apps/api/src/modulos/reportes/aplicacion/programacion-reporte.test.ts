import { describe, expect, it } from "bun:test";
import { calcularProximaEjecucion } from "./programacion-reporte.js";

describe("calcularProximaEjecucion", () => {
  it("respeta el cron en America/Guayaquil", () => {
    expect(
      calcularProximaEjecucion(
        "0 8 * * *",
        "America/Guayaquil",
        new Date("2026-08-14T18:00:00Z"),
      ).toISOString(),
    ).toBe("2026-08-15T13:00:00.000Z");
  });

  it("rechaza expresiones cron inválidas", () => {
    expect(() =>
      calcularProximaEjecucion(
        "esto no es cron",
        "America/Guayaquil",
        new Date("2026-08-14T18:00:00Z"),
      ),
    ).toThrow();
  });
});

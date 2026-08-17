import { describe, expect, it } from "bun:test";
import { esquemaCrearDesdePlantilla } from "./panel.js";

describe("creación de reportes desde Dataflow", () => {
  it("exige flujoId para reportes nuevos", () => {
    expect(() =>
      esquemaCrearDesdePlantilla.parse({
        nombre: "Ventas",
        plantillaIdQlik: "plantilla-1",
        reemplazosWorkspace: [],
      }),
    ).toThrow();
  });

  it("rechaza programacion en esquemaCrearDesdePlantilla", () => {
    expect(
      esquemaCrearDesdePlantilla.safeParse({
        nombre: "Ventas",
        plantillaIdQlik: "plantilla-1",
        flujoId: "flujo-1",
        reemplazosWorkspace: [],
        programacion: {
          activa: true,
          expresionCron: "0 8 * * *",
          zonaHoraria: "UTC",
        },
      }).success,
    ).toBe(false);
  });
});

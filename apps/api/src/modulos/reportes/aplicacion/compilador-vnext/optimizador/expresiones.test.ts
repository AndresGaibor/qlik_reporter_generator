import { describe, expect, it } from "bun:test";
import {
  referenciasExpresion,
  sustituirProyeccionEnExpresion,
} from "./expresiones.js";

const projections = [
  { expression: "Fecha", alias: "Fecha" },
  { expression: "Year(Fecha)", alias: "Anio" },
  { expression: "Upper([Sub bodega])", alias: "Sub bodega limpia" },
];

describe("optimizador de expresiones Qlik", () => {
  it("sustituye aliases calculados por AST sin tocar strings", () => {
    expect(
      sustituirProyeccionEnExpresion(
        "Anio = 2026 and 'Anio' = 'Anio'",
        projections,
      ),
    ).toBe("((Year([Fecha]) = 2026) and ('Anio' = 'Anio'))");
  });

  it("preserva referencias directas y nombres con espacios", () => {
    expect(
      sustituirProyeccionEnExpresion(
        "Fecha >= Date#('2026-01-01') and [Sub bodega limpia] = 'A'",
        projections,
      ),
    ).toBe(
      "(([Fecha] >= Date#('2026-01-01')) and (Upper([Sub bodega]) = 'A'))",
    );
  });

  it("rechaza una referencia que no pertenece a la proyección", () => {
    expect(
      sustituirProyeccionEnExpresion("NoExiste = 1", projections),
    ).toBeUndefined();
  });

  it("rechaza aliases duplicados por ser ambiguos", () => {
    expect(
      sustituirProyeccionEnExpresion("x = 1", [
        { expression: "a", alias: "x" },
        { expression: "b", alias: "x" },
      ]),
    ).toBeUndefined();
  });

  it("extrae referencias sin confundir nombres de funciones o strings", () => {
    expect(
      [...referenciasExpresion("Upper([Sub bodega]) = 'Fecha' and Fecha > 0")],
    ).toEqual(["Sub bodega", "Fecha"]);
  });
});

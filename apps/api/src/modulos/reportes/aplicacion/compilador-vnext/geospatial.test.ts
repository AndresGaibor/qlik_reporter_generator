import { describe, expect, it } from "bun:test";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

describe("clasificación geoespacial Qlik", () => {
  it("declara explícitamente qué lowerings usan GEOGRAPHY nativa", () => {
    expect(
      emitirExpresionBigQuery(parsearExpresionQlik("GeoMakePoint(1, 2)")),
    ).toContain("ST_GEOGPOINT(2, 1)");
    expect(
      emitirExpresionBigQuery(parsearExpresionQlik("GeoGetPolygonCenter([g])")),
    ).toContain("ST_CENTROID(`g`)");
  });

  it("no aproxima proyecciones Qlik con funciones de esfera incompatibles", () => {
    expect(() =>
      emitirExpresionBigQuery(parsearExpresionQlik("GeoProject([g])")),
    ).toThrowError(ErrorCompilacionVNext);
    try {
      emitirExpresionBigQuery(parsearExpresionQlik("GeoProject([g])"));
    } catch (error) {
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "GEOSPATIAL_SEMANTICS_UNSUPPORTED",
      );
    }
  });
});

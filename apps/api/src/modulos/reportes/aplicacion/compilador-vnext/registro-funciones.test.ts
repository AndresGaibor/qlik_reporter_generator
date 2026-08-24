import { describe, expect, it } from "bun:test";
import manifest from "../../fixtures/compiler-corpus/coverage-manifest.json";
import vectors from "../../fixtures/compiler-corpus/function-vectors.json";
import {
  obtenerFuncionQlik,
  REGISTRO_FUNCIONES_QLIK,
} from "./registro-funciones.js";

const official = manifest.entries.filter(
  (entry) => entry.surface === "qlik_function",
);

describe("registro declarativo de funciones Qlik", () => {
  it("tiene exactamente una entrada por ID oficial", () => {
    expect(REGISTRO_FUNCIONES_QLIK).toHaveLength(official.length);
    expect(new Set(REGISTRO_FUNCIONES_QLIK.map((entry) => entry.id))).toEqual(
      new Set(official.map((entry) => entry.id)),
    );
  });

  it("cada entrada declara estrategia, firma, determinismo y vectores", () => {
    for (const entry of REGISTRO_FUNCIONES_QLIK) {
      expect(entry.strategy).not.toBe("");
      expect(entry.signatureFamily).not.toBe("");
      expect(typeof entry.deterministic).toBe("boolean");
      expect(entry.requiredVectors.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("usa exactamente los vectores generados para cada función/categoría", () => {
    const byKey = new Map(
      vectors.functions.map((entry) => [
        `${entry.name.toLowerCase()}::${entry.category}`,
        entry.vectors,
      ]),
    );
    for (const entry of REGISTRO_FUNCIONES_QLIK) {
      const expected = byKey.get(`${entry.name.toLowerCase()}::${entry.category}`);
      expect(expected).toBeDefined();
      expect(entry.requiredVectors).toEqual(expected ?? []);
    }
  });

  it("distingue implementación runtime de certificación semántica", () => {
    expect(obtenerFuncionQlik("Upper")?.runtimeStatus).toBe("implemented");
    expect(obtenerFuncionQlik("Upper")?.certificationStatus).toBe("unverified");
    expect(obtenerFuncionQlik("ApplyMap")?.runtimeStatus).toBe("tracked");
  });

  it("clasifica familias que no admiten un mapping ingenuo", () => {
    expect(obtenerFuncionQlik("Hash128")?.strategy).toBe("qlik_hash_udf");
    expect(obtenerFuncionQlik("CountRegEx")?.strategy).toBe(
      "regex_engine_compatibility_or_udf",
    );
    expect(obtenerFuncionQlik("JsonGet")?.strategy).toBe(
      "json_pointer_lowering",
    );
    expect(obtenerFuncionQlik("Evaluate")?.strategy).toBe(
      "compile_time_expression_evaluator",
    );
    expect(obtenerFuncionQlik("SubField")?.strategy).toBe(
      "scalar_or_row_expansion",
    );
  });

  it("no inventa funciones fuera del inventario", () => {
    expect(obtenerFuncionQlik("FuncionInventada")).toBeUndefined();
  });
});

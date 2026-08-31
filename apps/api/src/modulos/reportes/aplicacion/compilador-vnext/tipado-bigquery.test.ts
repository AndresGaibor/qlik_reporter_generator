import { describe, expect, it } from "bun:test";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import type {
  ContextoExpresion,
  EntornoExpresionQlik,
} from "./expresiones-qlik.js";

const env = (
  fields: Record<
    string,
    { type: string; mode: "REQUIRED" | "NULLABLE" | "REPEATED" }
  >,
): EntornoExpresionQlik => ({
  fieldMetadata: fields,
});

const emit = (
  expression: string,
  environment: EntornoExpresionQlik,
  context: ContextoExpresion = "value",
) =>
  emitirExpresionBigQuery(
    parsearExpresionQlik(expression),
    context,
    environment,
  );

describe("lowering BigQuery guiado por tipos", () => {
  it("evita coerción string para argumentos numéricos demostrados", () => {
    const environment = env({ monto: { type: "NUMERIC", mode: "NULLABLE" } });
    expect(emit("Sign(monto)", environment)).toBe("SIGN(`monto`)");
    expect(emit("RangeSum(monto, 2)", environment)).toContain(
      "COALESCE(`monto`, 0)",
    );
  });

  it("mantiene coerción defensiva cuando el campo físico es STRING", () => {
    const environment = env({ monto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Sum(monto)", environment)).toContain("SAFE_CAST");
    expect(emit("Sign(monto)", environment)).toContain("SAFE_CAST");
  });

  it("evita CAST AS STRING para texto demostrado", () => {
    const environment = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Upper(texto)", environment)).toBe("UPPER(`texto`)");
    expect(emit("Mid(texto, 3)", environment)).toStartWith("SUBSTR(`texto`,");
  });

  it("emite SUM directo para NUMéricos conocidos sin SAFE_CAST", () => {
    const num = env({ monto: { type: "NUMERIC", mode: "NULLABLE" } });
    expect(emit("Sum(monto)", num)).toBe("SUM(`monto`)");
    const int = env({ cantidad: { type: "INT64", mode: "REQUIRED" } });
    expect(emit("Sum(cantidad)", int)).toBe("SUM(`cantidad`)");
    const flt = { type: "FLOAT64", mode: "NULLABLE" } as const;
    expect(emit("Sum(precio)", env({ precio: flt }))).toBe("SUM(`precio`)");
  });

  it("emite AVG directo para FLOAT64 sin SAFE_CAST", () => {
    const env2 = env({ promedio: { type: "FLOAT64", mode: "NULLABLE" } });
    expect(emit("Avg(promedio)", env2)).toBe("AVG(`promedio`)");
  });

  it("emite MIN/MAX directo para NUMéricos sin coerción", () => {
    const env2 = env({ monto: { type: "NUMERIC", mode: "NULLABLE" } });
    expect(emit("Min(monto)", env2)).toBe("MIN(`monto`)");
    expect(emit("Max(monto)", env2)).toBe("MAX(`monto`)");
  });

  it("usa coerción QlikNumérica para SUM/MAX de STRING", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Sum(texto)", env2)).toContain("SAFE_CAST");
    expect(emit("Avg(texto)", env2)).toContain("SAFE_CAST");
  });

  it("emite KeepChar/PurgeChar sin CAST en argumento de texto conocido", () => {
    const env2 = env({ campo: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("KeepChar(campo, 'ABC')", env2)).toContain(
      "TO_CODE_POINTS(`campo`)",
    );
    expect(emit("PurgeChar(campo, 'ABC')", env2)).toContain(
      "TO_CODE_POINTS(`campo`)",
    );
  });

  it("emite Index sin CAST en substring literal", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Index(texto, 'ab')", env2)).toContain("INSTR(`texto`, 'ab'");
  });

  it("emite Match sin CAST en literales de patrón", () => {
    const env2 = env({ valor: { type: "STRING", mode: "NULLABLE" } });
    const result = emit("Match(valor, 'A', 'B')", env2);
    expect(result).toContain("= 'A' THEN 1");
    expect(result).toContain("= 'B' THEN 2");
    expect(result).not.toContain("= CAST('A' AS STRING)");
  });

  it("emite SubStringCount sin CAST en substring literal", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("SubStringCount(texto, 'ab')", env2)).toContain("= 'ab'");
  });

  it("emite TextBetween sin CAST en delimitadores literales", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("TextBetween(texto, '<', '>')", env2)).toContain(
      "INSTR(`texto`, '<'",
    );
  });

  it("emite FindOneOf sin CAST en charset literal", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("FindOneOf(texto, 'aeiou')", env2)).toContain(
      "TO_CODE_POINTS('aeiou')",
    );
  });

  it("emite SubField sin CAST en delimitador literal", () => {
    const env2 = env({ campo: { type: "STRING", mode: "NULLABLE" } });
    const result = emit("SubField(campo, ',', 1)", env2);
    expect(result).toContain("SPLIT(");
    expect(result).toContain("',')");
  });

  it("Upper/Lower/Trim directo para campo STRING conocido", () => {
    const env2 = env({ texto: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Upper(texto)", env2)).toBe("UPPER(`texto`)");
    expect(emit("Lower(texto)", env2)).toBe("LOWER(`texto`)");
    expect(emit("Trim(texto)", env2)).toBe("TRIM(`texto`)");
  });

  it("rechaza agregación sobre campo REPEATED/ARRAY", () => {
    const env2 = env({ items: { type: "STRING", mode: "REPEATED" } });
    expect(() => emit("Sum(items)", env2)).toThrow(/REPEATED.*ARRAY/);
  });

  it("helpers de tipos complejos funcionan correctamente", async () => {
    const { esRepeated, esTipoEscalar, esTipoComplejo, nombreTipoLegible } =
      await import("./expresiones-qlik/tipado-campos.js");
    expect(esRepeated({ type: "STRING", mode: "REPEATED" })).toBe(true);
    expect(esRepeated({ type: "STRING", mode: "NULLABLE" })).toBe(false);
    expect(esTipoEscalar({ type: "STRING", mode: "NULLABLE" })).toBe(true);
    expect(esTipoEscalar({ type: "STRUCT", mode: "NULLABLE" })).toBe(false);
    expect(esTipoEscalar({ type: "RECORD", mode: "NULLABLE" })).toBe(false);
    expect(esTipoComplejo({ type: "JSON", mode: "NULLABLE" })).toBe(true);
    expect(esTipoComplejo({ type: "GEOGRAPHY", mode: "NULLABLE" })).toBe(true);
    expect(nombreTipoLegible({ type: "STRING", mode: "REPEATED" })).toBe(
      "STRING (ARRAY)",
    );
    expect(nombreTipoLegible({ type: "NUMERIC", mode: "NULLABLE" })).toBe(
      "NUMERIC",
    );
  });

  it("usa serial Qlik para SUM de DATE en contexto numérico", () => {
    const env2 = env({ fecha: { type: "DATE", mode: "NULLABLE" } });
    const result = emit("Sum(fecha)", env2);
    expect(result).toContain("SUM(");
    expect(result).not.toContain("SAFE_CAST(CAST(`fecha` AS STRING)");
  });

  it("COUNT no transforma el argumento con coerce numérica", () => {
    const env2 = env({ campo: { type: "STRING", mode: "NULLABLE" } });
    expect(emit("Count(campo)", env2)).toBe("COUNT(`campo`)");
  });

  it("especializa DATE y TIMESTAMP sin conversores genéricos", () => {
    const environment = env({
      fecha: { type: "DATE", mode: "REQUIRED" },
      ts: { type: "TIMESTAMP", mode: "NULLABLE" },
    });
    expect(emit("Year(fecha)", environment)).toBe("EXTRACT(YEAR FROM `fecha`)");
    expect(emit("Hour(ts)", environment)).toBe(
      "EXTRACT(HOUR FROM `ts` AT TIME ZONE 'UTC')",
    );
    expect(emit("MonthStart(fecha)", environment, "numeric")).not.toContain(
      "COALESCE(",
    );
  });
});

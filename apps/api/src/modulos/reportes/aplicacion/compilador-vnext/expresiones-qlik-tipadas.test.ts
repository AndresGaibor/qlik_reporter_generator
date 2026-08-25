import { describe, expect, it } from "bun:test";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { compilarDataflowVNext } from "./index.js";

const typed = {
  fieldMetadata: {
    Cantidad: { type: "NUMERIC", mode: "NULLABLE" as const },
    Costo: { type: "INT64", mode: "REQUIRED" as const },
    Nombre: { type: "STRING", mode: "NULLABLE" as const },
  },
};

const emit = (
  expression: string,
  context: "value" | "numeric" | "text" = "value",
) => emitirExpresionBigQuery(parsearExpresionQlik(expression), context, typed);

describe("lowering Qlik guiado por tipos BigQuery", () => {
  it("no convierte campos numéricos conocidos a STRING/BIGNUMERIC", () => {
    expect(emit("Cantidad", "numeric")).toBe("`Cantidad`");
    expect(emit("Cantidad + Costo", "numeric")).toBe("`Cantidad` + `Costo`");
    expect(emit("RangeSum(Cantidad, Costo)")).not.toContain("SAFE_CAST(CAST(");
  });

  it("no castea a STRING un campo STRING conocido", () => {
    expect(emit("Nombre", "text")).toBe("`Nombre`");
  });

  it("propaga la optimización numérica desde sourceMetadata", () => {
    const result = compilarDataflowVNext(
      `LIB CONNECT TO [Google BigQuery:Prod];
       [Base]: LOAD Cantidad, Costo;
       SQL SELECT Cantidad, Costo FROM \`p.d.ventas\`;
       [Salida]: LOAD RangeSum(Cantidad, Costo) AS Total RESIDENT [Base];`,
      {
        sourceMetadata: {
          "p.d.ventas": {
            tableId: "p.d.ventas",
            fields: {
              Cantidad: { type: "NUMERIC", mode: "NULLABLE" },
              Costo: { type: "INT64", mode: "REQUIRED" },
            },
          },
        },
      },
    );
    expect(result.sql).toContain(
      "COALESCE(`Cantidad`, 0) + COALESCE(`Costo`, 0)",
    );
    expect(result.sql).not.toContain("SAFE_CAST(CAST(`Cantidad` AS STRING)");
    expect(result.sql).not.toContain("SAFE_CAST(CAST(`Costo` AS STRING)");
  });

  it("mantiene el fallback defensivo para campos desconocidos", () => {
    const sql = emitirExpresionBigQuery(
      parsearExpresionQlik("Desconocido"),
      "numeric",
      {},
    );
    expect(sql).toContain(
      "SAFE_CAST(CAST(`Desconocido` AS STRING) AS BIGNUMERIC)",
    );
  });
});

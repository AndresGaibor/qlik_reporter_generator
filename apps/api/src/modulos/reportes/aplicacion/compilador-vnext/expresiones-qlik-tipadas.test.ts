import { describe, expect, it } from "bun:test";
import {
  emitirExpresionBigQuery,
  parsearExpresionQlik,
} from "./expresiones-qlik.js";
import { compilarDataflowVNext } from "./index.js";

const typed = {
  dateFormat: "YYYY-MM-DD",
  timestampFormat: "YYYY-MM-DD hh:mm:ss",
  firstWeekDay: 0,
  brokenWeeks: 0,
  referenceDay: 4,
  monthNames: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  fieldMetadata: {
    Cantidad: { type: "NUMERIC", mode: "NULLABLE" as const },
    Costo: { type: "INT64", mode: "REQUIRED" as const },
    Nombre: { type: "STRING", mode: "NULLABLE" as const },
    Fecha: { type: "DATE", mode: "REQUIRED" as const },
    Instante: { type: "TIMESTAMP", mode: "NULLABLE" as const },
    Momento: { type: "DATETIME", mode: "NULLABLE" as const },
    Hora: { type: "TIME", mode: "NULLABLE" as const },
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

  it("usa tipos temporales nativos sin COALESCE defensivo", () => {
    expect(emit("Year(Fecha)")).toBe("EXTRACT(YEAR FROM `Fecha`)");
    expect(emit("Month(Fecha)", "numeric")).toBe("EXTRACT(MONTH FROM `Fecha`)");
    expect(emit("Year(Momento)")).toBe("EXTRACT(YEAR FROM `Momento`)");
    expect(emit("Hour(Instante)")).toBe(
      "EXTRACT(HOUR FROM `Instante` AT TIME ZONE 'UTC')",
    );
    expect(emit("Minute(Hora)")).toBe("EXTRACT(MINUTE FROM `Hora`)");
  });

  it("especializa calendario y límites temporales con metadata", () => {
    expect(emit("Quarter(Fecha)")).toBe("EXTRACT(QUARTER FROM `Fecha`)");
    expect(emit("Week(Fecha)")).toBe("EXTRACT(ISOWEEK FROM `Fecha`)");
    expect(emit("MonthStart(Fecha)", "numeric")).not.toContain(
      "SAFE_CAST(CAST(`Fecha` AS STRING)",
    );
    expect(emit("MonthEnd(Fecha)")).not.toContain(
      "SAFE_CAST(CAST(`Fecha` AS STRING)",
    );
    expect(emit("DayStart(Instante)")).not.toContain(
      "SAFE_CAST(CAST(`Instante` AS STRING)",
    );
  });

  it("convierte temporales nativos a serial Qlik solo en contexto numérico", () => {
    const arithmetic = emit("Fecha + 1", "numeric");
    expect(arithmetic).toContain("TIMESTAMP_DIFF(TIMESTAMP(`Fecha`, 'UTC')");
    expect(arithmetic).not.toContain("SAFE_CAST(CAST(`Fecha` AS STRING)");
    const sign = emit("Sign(Instante)");
    expect(sign).toContain("TIMESTAMP_DIFF(`Instante`");
    expect(sign).not.toContain("SAFE_CAST(CAST(`Instante` AS STRING)");
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

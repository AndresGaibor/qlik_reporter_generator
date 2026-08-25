import { describe, expect, it } from "bun:test";
import {
  compile,
  compileWithEnv,
  expectCode,
} from "./expresiones-qlik-test-helpers.js";
import { esExpresionDualQlik } from "./expresiones-qlik.js";

describe("parser de expresiones Qlik vNext / temporal y agregados", () => {
  it("formatea Date con el DateFormat explícito del script", () => {
    const sql = compileWithEnv("Date([fecha])", { dateFormat: "YYYY-MM-DD" });
    expect(sql).toContain("FORMAT_DATE('%Y-%m-%d'");
    expect(sql).toContain("DATE '1899-12-30'");
  });

  it("detecta duales anidados de forma conservadora", () => {
    expect(esExpresionDualQlik("Date([fecha])")).toBe(true);
    expect(esExpresionDualQlik("If([flag], Date([fecha]), 'N/A')")).toBe(true);
    expect(esExpresionDualQlik("Upper([texto])")).toBe(false);
  });

  it("usa el componente numérico de Date y Num en aritmética", () => {
    const dateMath = compileWithEnv("Date([fecha]) + 1", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(dateMath).not.toContain("FORMAT_DATE");
    expect(dateMath).toContain("TIMESTAMP_DIFF(");
    const numMath = compileWithEnv("Num([monto], '#,##0.00') * 2", {});
    expect(numMath).not.toContain("STRING FORMAT");
    expect(numMath).toContain(
      "SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)",
    );
  });

  it("usa el componente numérico de Month pero el texto dual al concatenar", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
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
    } satisfies EntornoExpresionQlik;
    const monthMath = compileWithEnv("Month([fecha]) * 1", environment);
    expect(monthMath).toContain("EXTRACT(MONTH FROM");
    expect(monthMath).not.toContain("WHEN 1 THEN 'Jan'");
    expect(compileWithEnv("Date([fecha]) & '-x'", environment)).toContain(
      "FORMAT_DATE('%Y-%m-%d'",
    );
  });

  it("extrae componentes enteros de fecha/hora desde serial Qlik o timestamp", () => {
    expect(compile("Day([fecha])")).toContain("EXTRACT(DAY FROM");
    expect(compile("Hour([fecha])")).toContain("EXTRACT(HOUR FROM");
    expect(compile("Minute([fecha])")).toContain("EXTRACT(MINUTE FROM");
    expect(compile("Second([fecha])")).toContain("EXTRACT(SECOND FROM");
    const iso = { firstWeekDay: 0, brokenWeeks: 0, referenceDay: 4 };
    expect(compileWithEnv("Week([fecha])", iso)).toContain(
      "EXTRACT(ISOWEEK FROM",
    );
    expect(compileWithEnv("WeekYear([fecha])", iso)).toContain(
      "EXTRACT(ISOYEAR FROM",
    );
  });

  it("no confunde calendarios Week no-ISO con ISO", () => {
    expectCode(() => compile("Week([fecha])"), "WEEK_ENV_REQUIRED");
    expectCode(
      () =>
        compileWithEnv("Week([fecha])", {
          firstWeekDay: 6,
          brokenWeeks: 1,
          referenceDay: 1,
        }),
      "WEEK_CONFIGURATION_REQUIRES_CALENDAR_LOWERING",
    );
  });

  it("implementa Quarter estándar y fiscal", () => {
    expect(compile("Quarter([fecha])")).toContain("EXTRACT(QUARTER FROM");
    const fiscal = compile("Quarter([fecha], 4)");
    expect(fiscal).toContain("MOD(EXTRACT(MONTH FROM");
    expect(fiscal).toContain("CAST(4 AS INT64)");
  });

  it("implementa MakeDate, AddYears y AddMonths como duales", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("MakeDate(2024, 2, 29)", environment)).toContain(
      "FORMAT_DATE('%Y-%m-%d'",
    );
    expect(compileWithEnv("AddYears([fecha], 2)", environment)).toContain(
      "INTERVAL CAST(TRUNC(2) AS INT64) YEAR",
    );
    const normal = compileWithEnv("AddMonths([fecha], 2)", environment);
    expect(normal).toContain("DATE_ADD(");
    const relativeEnd = compileWithEnv("AddMonths([fecha], 2, 1)", environment);
    expect(relativeEnd).toContain("LAST_DAY(");
    expect(relativeEnd).toContain("EXTRACT(DAY FROM");
    expect(esExpresionDualQlik("AddMonths([fecha], 1)")).toBe(true);
  });

  it("usa el componente serial de duales de fecha nuevos en aritmética", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
    } satisfies EntornoExpresionQlik;
    const sql = compileWithEnv("AddYears([fecha], 1) + 1", environment);
    expect(sql).toContain("DATE_DIFF(");
    expect(sql).not.toContain("FORMAT_DATE");
  });

  it("implementa MakeTime como dual con defaults mm/ss y TimeFormat", () => {
    const environment = {
      timeFormat: "h:mm:ss",
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("MakeTime(9)", environment)).toContain(
      "FORMAT('%d:%02d:%02d'",
    );
    expect(compileWithEnv("MakeTime(9, 5, 2)", environment)).toContain(
      "SAFE.PARSE_TIME('%H:%M:%S'",
    );
    expect(esExpresionDualQlik("MakeTime(9, 5)")).toBe(true);
  });

  it("usa la fracción de día de MakeTime en aritmética", () => {
    const sql = compileWithEnv("MakeTime(12, 0, 0) * 2", {
      timeFormat: "hh:mm:ss",
    });
    expect(sql).toContain("TIME_DIFF(");
    expect(sql).toContain("86400000000");
    expect(sql).not.toContain("FORMAT_TIME");
  });

  it("requiere TimeFormat para el texto dual de MakeTime", () => {
    expectCode(() => compile("MakeTime(9)"), "TIME_FORMAT_ENV_REQUIRED");
  });

  it("implementa WeekDay como dual con DayNames y FirstWeekDay", () => {
    const environment = {
      dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      firstWeekDay: 0,
    } satisfies EntornoExpresionQlik;
    const display = compileWithEnv("WeekDay([fecha])", environment);
    expect(display).toContain("WHEN 0 THEN 'Mon'");
    expect(display).toContain("WHEN 6 THEN 'Sun'");
    const numeric = compileWithEnv("WeekDay([fecha]) * 1", environment);
    expect(numeric).toContain("MOD(");
    expect(numeric).not.toContain("THEN 'Mon'");
    expect(esExpresionDualQlik("WeekDay([fecha])")).toBe(true);
  });

  it("preserva el valor visible de Month y MonthStart con entorno explícito", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
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
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("Month([fecha])", environment)).toContain(
      "CASE EXTRACT(MONTH FROM",
    );
    expect(compileWithEnv("MonthStart([fecha])", environment)).toContain(
      "DATE_TRUNC(",
    );
  });

  it("implementa Num sin format_code usando el formato numérico general del script", () => {
    const sql = compileWithEnv("Num(Month([fecha]))", {
      decimalSep: ".",
      thousandSep: ",",
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
    });
    expect(sql).toContain("CAST(EXTRACT(MONTH FROM");
    expect(sql).toContain("AS STRING)");
    expect(sql).not.toContain("STRING FORMAT");
  });

  it("implementa Num para los patrones de formato certificados inicialmente", () => {
    const sql = compileWithEnv("Num([monto], '#,##0.00')", {});
    expect(sql).toContain("STRING FORMAT");
    expect(sql).toContain("G");
    expect(sql).toContain("D00");
  });

  it("implementa DayStart y DayEnd con day_start fraccional y último milisegundo", () => {
    const env = { timestampFormat: "M/D/YYYY h:mm:ss[.fff] TT" };
    const start = compileWithEnv("DayStart([ts], -1, 0.5)", env);
    expect(start).toContain("TIMESTAMP_TRUNC(");
    expect(start).toContain("86400000000");
    expect(start).not.toContain("WITH ");

    const end = compileWithEnv("DayEnd([ts], 0, 0.5)", env);
    expect(end).toContain("TIMESTAMP_SUB(");
    expect(end).toContain("INTERVAL 1 MILLISECOND");
    expect(end).toContain("FORMAT(");
  });

  it("usa el serial Qlik de DayEnd en aritmética", () => {
    const sql = compileWithEnv("DayEnd([ts]) - DayStart([ts])", {
      timestampFormat: "YYYY-MM-DD hh:mm:ss",
    });
    expect(sql).toContain("TIMESTAMP_DIFF(");
    expect(sql).toContain("86400000000");
  });

  it("implementa límites de mes/trimestre/año como duales sin CTEs artificiales", () => {
    const monthEnd = compileWithEnv("MonthEnd([fecha], -1)", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(monthEnd).toContain("TIMESTAMP_SUB(");
    expect(monthEnd).toContain("INTERVAL 1 MILLISECOND");
    expect(monthEnd).not.toContain("WITH ");

    const quarterStart = compileWithEnv("QuarterStart([fecha], 0, 3)", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(quarterStart).toContain("DATE_TRUNC(");
    expect(quarterStart).toContain("QUARTER");
    expect(quarterStart).toContain("INTERVAL 2 MONTH");

    const quarterEnd = compileWithEnv("QuarterEnd([fecha], 1, 3)", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(quarterEnd).toContain("TIMESTAMP_SUB(");
    expect(quarterEnd).toContain("INTERVAL 1 MILLISECOND");

    const yearStart = compileWithEnv("YearStart([fecha], -1, 4)", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(yearStart).toContain("DATE_TRUNC(");
    expect(yearStart).toContain("YEAR");
    expect(yearStart).toContain("INTERVAL 3 MONTH");

    const yearEnd = compileWithEnv("YearEnd([fecha], 0, 4)", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(yearEnd).toContain("TIMESTAMP_SUB(");
    expect(yearEnd).toContain("INTERVAL 1 MILLISECOND");
  });

  it("usa el serial temporal de los límites duales cuando entran en aritmética", () => {
    const sql = compileWithEnv("QuarterEnd([fecha]) + 1", {
      dateFormat: "YYYY-MM-DD",
    });
    expect(sql).toContain("TIMESTAMP_DIFF(");
    expect(sql).toContain("86400000000");
    expect(sql).toContain(" + ");
  });

  it("implementa Only con la clave dual y NULL para múltiples valores", () => {
    const sql = compile("Only([id])");
    expect(sql).toContain("COUNT(DISTINCT key) = 1");
    expect(sql).toContain("ANY_VALUE(visible)");
    expect(sql).not.toContain("WITH ");
  });

  it("baja Mode y FirstSortedValue con empate explícito", () => {
    expect(compile("Mode([id])")).toContain("COUNT(DISTINCT key)");
    expect(compile("FirstSortedValue([id], [peso])")).toContain("COUNT(*) = 1");
  });

  it("mantiene agregaciones básicas como SQL nativo", () => {
    expect(compile("Sum([monto])")).toBe("SUM(`monto`)");
    expect(compile("Min([monto])")).toBe("MIN(`monto`)");
    expect(compile("Max([monto])")).toBe("MAX(`monto`)");
    expect(compile("Count([id])")).toBe("COUNT(`id`)");
    expect(compile("Count(*)")).toBe("COUNT(*)");
    expect(compile("Count(DISTINCT [id])")).toBe("COUNT(DISTINCT `id`)");
    expect(compile("Sum(DISTINCT [monto])")).toBe("SUM(DISTINCT `monto`)");
  });

  it("implementa contadores Qlik distinguiendo NULL texto y número", () => {
    expect(compile("NullCount([x])")).toContain("COUNTIF(`x` IS NULL)");
    expect(compile("NumericCount([x])")).toContain("COUNTIF(SAFE_CAST(");
    expect(compile("TextCount([x])")).toContain(
      "`x` IS NOT NULL AND SAFE_CAST(",
    );
    expect(compile("MissingCount([x])")).toContain("COUNTIF(SAFE_CAST(");
    expect(compile("MissingCount([x])")).toContain(" IS NULL)");
    expectCode(
      () => compile("NumericCount(DISTINCT [x])"),
      "AGGREGATION_DISTINCT_REQUIRES_TYPED_LOWERING",
    );
  });

  it("RangeSum trata no-numéricos como cero sin subquery innecesaria", () => {
    const sql = compile("RangeSum([a], [b], 'abc', Null())");
    expect(sql).toContain("COALESCE(SAFE_CAST(");
    expect(sql).toContain(" + ");
    expect(sql).not.toContain("SELECT");
  });

  it("RangeAvg Min Max ignoran no-numéricos y usan un array tipado", () => {
    const avg = compile("RangeAvg([a], [b], 'abc')");
    expect(avg).toContain("SELECT AVG(value) FROM UNNEST([");
    const min = compile("RangeMin([a], [b])");
    expect(min).toContain("SELECT MIN(value) FROM UNNEST([");
    const max = compile("RangeMax([a], [b])");
    expect(max).toContain("SELECT MAX(value) FROM UNNEST([");
  });

  it("implementa contadores Range sin confundir texto y NULL", () => {
    expect(compile("RangeCount([a], [b])")).toContain(
      "CASE WHEN `a` IS NULL THEN 0 ELSE 1 END",
    );
    expect(compile("RangeNullCount([a], [b])")).toContain(
      "CASE WHEN `a` IS NULL THEN 1 ELSE 0 END",
    );
    expect(compile("RangeNumericCount([a], [b])")).toContain("SAFE_CAST(");
    expect(compile("RangeTextCount([a], [b])")).toContain("`a` IS NOT NULL");
    expect(compile("RangeMissingCount([a], [b])")).toContain(
      " IS NULL THEN 1 ELSE 0 END",
    );
  });
});

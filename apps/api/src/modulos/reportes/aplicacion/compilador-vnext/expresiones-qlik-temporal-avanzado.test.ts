import { describe, expect, it } from "bun:test";
import {
  compile,
  compileWithEnv,
  expectCode,
} from "./expresiones-qlik-test-helpers.js";
import type { EntornoExpresionQlik } from "./expresiones-qlik.js";

describe("parser de expresiones Qlik vNext / temporal avanzado", () => {
  it("baja edad, numeración de días y nombres temporales como SQL dual", () => {
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
      firstWeekDay: 0,
      brokenWeeks: 0,
      referenceDay: 4,
    } satisfies EntornoExpresionQlik;

    expect(compile("Age('2024-02-28', '2000-02-29')")).toContain("DATE_DIFF(");
    expect(compile("DayNumberOfYear('2024-02-29')")).toContain("DATE_DIFF(");
    expect(compile("DayNumberOfQuarter('2024-02-29')")).toContain("DATE_DIFF(");
    expect(
      compileWithEnv("MonthName('2024-02-29') * 1", environment),
    ).toContain("TIMESTAMP_DIFF(");
    expect(compileWithEnv("QuarterName('2024-02-29')", environment)).toContain(
      "WHEN 1 THEN 'Jan'",
    );
    expect(compileWithEnv("WeekName('2024-02-29')", environment)).toContain(
      "EXTRACT(ISOWEEK FROM",
    );
    expect(compileWithEnv("YearName('2024-02-29')", environment)).toContain(
      "FORMAT_DATE('%Y'",
    );
  });

  it("baja límites de semana, fechas ISO, segmentos e inclusiones temporales", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      firstWeekDay: 0,
      brokenWeeks: 0,
      referenceDay: 4,
    } satisfies EntornoExpresionQlik;

    expect(compileWithEnv("WeekStart('2024-02-29')", environment)).toContain(
      "DATE_SUB(",
    );
    expect(compileWithEnv("WeekEnd('2024-02-29')", environment)).toContain(
      "INTERVAL 1 MILLISECOND",
    );
    expect(compileWithEnv("MakeWeekDate(2024, 9, 4)", environment)).toContain(
      "ISOWEEK",
    );
    expect(
      compileWithEnv("MonthsStart(3, '2024-02-29')", environment),
    ).toContain("DATE_DIFF(");
    expect(compileWithEnv("MonthsEnd(3, '2024-02-29')", environment)).toContain(
      "INTERVAL 1 MILLISECOND",
    );
    expect(compile("InDay('2024-02-29', '2024-02-29', 0)")).toContain(
      "THEN -1 ELSE 0 END",
    );
    expect(compile("InMonths(3, '2024-02-29', '2024-02-01', 0)")).toContain(
      "TIMESTAMP(",
    );
    expect(compile("InYearToDate('2024-02-28', '2024-02-29', 0)")).toContain(
      "<=",
    );
  });

  it("baja jornadas laborales nativas y conserva fechas de retorno", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
    } satisfies EntornoExpresionQlik;
    expect(
      compileWithEnv(
        "NetworkDays('2024-02-01', '2024-02-09', '2024-02-05')",
        environment,
      ),
    ).toContain("GENERATE_DATE_ARRAY");
    expect(
      compileWithEnv(
        "FirstWorkDate('2024-02-09', 5, '2024-02-05')",
        environment,
      ),
    ).toContain("ARRAY_AGG");
    expect(
      compileWithEnv(
        "LastWorkDate('2024-02-01', 5, '2024-02-05')",
        environment,
      ),
    ).toContain("ARRAY_AGG");
    expect(
      compileWithEnv(
        "SetDateYearMonth('2024-02-29 10:15:00', 2025, 3)",
        environment,
      ),
    ).toContain("SAFE.PARSE_DATE");
  });

  it("solo acepta funciones de reloj con semántica UTC de ejecución representable", () => {
    const environment = {
      dateFormat: "YYYY-MM-DD",
      timestampFormat: "YYYY-MM-DD hh:mm:ss",
    } satisfies EntornoExpresionQlik;
    expect(compileWithEnv("Now()", environment)).toContain(
      "CURRENT_TIMESTAMP()",
    );
    expect(compileWithEnv("Today()", environment)).toContain(
      "CURRENT_DATE('UTC')",
    );
    expect(compileWithEnv("GMT()", environment)).toContain(
      "CURRENT_TIMESTAMP()",
    );
    expect(compileWithEnv("UTC()", environment)).toContain(
      "CURRENT_TIMESTAMP()",
    );
    expect(compile("TimeZone()")).toContain("'UTC'");
    expectCode(
      () => compile("LocalTime('Quito')"),
      "TEMPORAL_RUNTIME_CONTEXT_REQUIRED",
    );
    expectCode(
      () => compile("ConvertToLocalTime([ts], 'Quito')"),
      "TEMPORAL_RUNTIME_CONTEXT_REQUIRED",
    );
  });
});

import { describe, expect, it } from "bun:test";
import catalog from "../../fixtures/compiler-corpus/conformance-catalog.json";
import manifest from "../../fixtures/compiler-corpus/coverage-manifest.json";
import vectors from "../../fixtures/compiler-corpus/function-vectors.json";
import runtime from "../../fixtures/compiler-corpus/runtime-function-status.json";
import scenarios from "../../fixtures/compiler-corpus/scenarios.json";
import {
  evaluarCalidadSql,
  generarReporteConformance,
  validarContratoConformance,
} from "./conformance-gates.js";
import type { EntradaConformance } from "./conformance-gates.js";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const entradas = {
  manifest,
  runtime,
  scenarios,
  vectors,
  catalog,
} as unknown as EntradaConformance;
const corpusRoot = new URL("../../fixtures/compiler-corpus/", import.meta.url);

describe("gates de conformance del compilador vNext", () => {
  it("deriva inventario, runtime y vectores sin hardcodear sus tamaños", () => {
    const violations = validarContratoConformance(entradas);

    expect(violations).toEqual([]);
  });

  it("produce métricas separadas para tracked, implemented, certified y no-equivalent", () => {
    const report = generarReporteConformance(entradas, [
      {
        scenario_id: "qlik-filter-project",
        status: "compiled",
        sql: "SELECT 1",
      },
    ]);

    expect(report.metrics.tracked).toBe(manifest.entries.length);
    expect(report.metrics.implemented).toBe(
      runtime.functions.filter(
        (entry) => entry.status === "implemented_unverified",
      ).length,
    );
    expect(report.metrics.certified).toBe(catalog.certificates.length);
    expect(report.metrics.intentionally_non_equivalent).toBe(
      catalog.intentionally_non_equivalent.length,
    );
    expect(report.certificates).toHaveLength(catalog.certificates.length);
    expect(report.sql_quality).toHaveLength(catalog.sql_quality.length);
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "SQL_OUTPUT_MISSING" }),
    );
  });

  it("rechaza un certificado que no tiene referencia y golden", () => {
    const violations = validarContratoConformance({
      ...entradas,
      catalog: {
        ...entradas.catalog,
        certificates: [
          {
            id: "scenario:sql-native-inner-join",
            reference: "qlik/sql-native-inner-join.qlik",
          },
        ],
      },
    });

    expect(violations).toContainEqual(
      expect.objectContaining({ code: "CERTIFICATE_GOLDEN_REQUIRED" }),
    );
  });

  it("solo cuenta como certificado un registro con evidencia completa", () => {
    const report = generarReporteConformance(
      {
        ...entradas,
        catalog: {
          ...entradas.catalog,
          certificates: [
            {
              id: "scenario:sql-native-inner-join",
              reference: "qlik/sql-native-inner-join.qlik",
              golden: "goldens/sql-native-inner-join.sql",
            },
            {
              id: "processor:filter",
              reference: "docs/filter-reference.md",
              golden: "goldens/filter.sql",
            },
            {
              id: "scenario:sql-native-left-join",
              reference: "qlik/sql-native-left-join.qlik",
            },
          ],
        },
      },
      [],
    );

    expect(report.metrics.certified).toBe(2);
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "CERTIFICATE_GOLDEN_REQUIRED" }),
    );
  });

  it("rechaza ejecuciones duplicadas, desconocidas y escenarios omitidos", () => {
    const report = generarReporteConformance(entradas, [
      {
        scenario_id: "qlik-filter-project",
        status: "compiled",
        sql: "SELECT 1",
      },
      {
        scenario_id: "qlik-filter-project",
        status: "compiled",
        sql: "SELECT 1",
      },
      {
        scenario_id: "scenario-que-no-existe",
        status: "rejected",
        diagnostic_code: "UNSUPPORTED",
      },
    ]);

    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "SCENARIO_EXECUTION_DUPLICATE_ID" }),
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "SCENARIO_EXECUTION_UNKNOWN_ID" }),
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "SCENARIO_EXECUTION_MISSING" }),
    );
  });

  it("rechaza runtime y vectores que no pertenecen al inventario oficial", () => {
    const violations = validarContratoConformance({
      ...entradas,
      runtime: {
        ...entradas.runtime,
        functions: [
          ...entradas.runtime.functions,
          {
            name: "RuntimeFunctionOutsideManifest",
            category: "Synthetic",
            docs: "fixture",
            status: "tracked",
          },
        ],
      },
      vectors: {
        functions: [
          ...entradas.vectors.functions,
          {
            name: "VectorFunctionOutsideManifest",
            category: "Synthetic",
            vectors: [],
          },
        ],
      },
    });

    expect(violations).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_FUNCTION_TARGET_UNKNOWN" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ code: "FUNCTION_VECTOR_TARGET_UNKNOWN" }),
    );
  });

  it("protege SQL plano para filtro/proyección simple", () => {
    const result = evaluarCalidadSql(
      "SELECT `id`, UPPER(`categoria`) AS `Categoria`, `monto` FROM `p.d.ventas` WHERE `monto` > 0",
      {
        required: ["FROM `p.d.ventas`", "WHERE `monto` > 0"],
        forbidden: ["WITH fuente_", "FROM ( SELECT", "CASE", "CAST("],
        max_selects: 1,
        max_ctes: 0,
        max_subqueries: 0,
        max_cases: 0,
        max_casts: 0,
        max_synthetic_layers: 0,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.metrics.selects).toBe(1);
  });

  it("exige que la regresión preserve JOIN, WHERE y GROUP BY ALL", () => {
    const result = evaluarCalidadSql(
      "SELECT a.id FROM `p.d.a` a INNER JOIN `p.d.b` b ON a.id = b.id WHERE a.activo = TRUE GROUP BY ALL",
      {
        required: ["INNER JOIN", "WHERE", "GROUP BY ALL"],
        forbidden: ["fuente_", "filtro_", "proyeccion_"],
        exact_occurrences: { "INNER JOIN": 1 },
        max_selects: 1,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("permite complejidad cuando el golden declara que es necesaria", () => {
    const result = evaluarCalidadSql(
      "WITH base AS (SELECT id FROM `p.d.a`) SELECT id FROM base",
      {
        required: ["WITH base AS", "SELECT id FROM base"],
        forbidden: ["fuente_", "CASE"],
        min_selects: 2,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.metrics.selects).toBe(2);
  });

  it("ignora keywords de literales/comentarios y WITH OFFSET no es un CTE", () => {
    const result = evaluarCalidadSql(
      "SELECT 'SELECT CASE CAST(' AS texto /* WITH SELECT */ FROM UNNEST([1]) WITH OFFSET AS posicion",
      {
        forbidden: ["CASE", "CAST("],
        max_selects: 1,
        max_ctes: 0,
        max_cases: 0,
        max_casts: 0,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.metrics).toMatchObject({
      selects: 1,
      ctes: 0,
      cases: 0,
      casts: 0,
    });
  });

  it("ejecuta las reglas SQL del catálogo sobre sus fixtures reales", async () => {
    const executions = [];
    for (const scenario of scenarios.scenarios) {
      const script = await Bun.file(
        new URL(scenario.fixture, corpusRoot),
      ).text();
      try {
        executions.push({
          scenario_id: scenario.id,
          status: "compiled" as const,
          sql: compilarDataflowVNext(script).sql,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorCompilacionVNext);
        executions.push({
          scenario_id: scenario.id,
          status: "rejected" as const,
          diagnostic_code: (error as ErrorCompilacionVNext).diagnostic.code,
        });
      }
    }

    const report = generarReporteConformance(entradas, executions);

    expect(report.violations).toEqual([]);
    expect(report.scenarios.compiled + report.scenarios.rejected).toBe(
      scenarios.scenarios.length,
    );
    expect(report.sql_quality.every((entry) => entry.result.ok)).toBe(true);
  });
});

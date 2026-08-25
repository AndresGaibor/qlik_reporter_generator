import { evaluarCalidadSql } from "./calidad-sql.js";
import {
  agregarDuplicados,
  contarPorRuntimeStatus,
  contarPorSurface,
  esTargetCertificadoConocido,
  quitarPrefijoScenario,
  validarContratoConformance,
} from "./contrato.js";
import type {
  EjecucionEscenarioConformance,
  EntradaConformance,
  ReporteConformance,
} from "./tipos.js";

export function generarReporteConformance(
  input: EntradaConformance,
  executions: EjecucionEscenarioConformance[],
): ReporteConformance {
  const violations = validarContratoConformance(input);
  const scenarioIds = new Set(
    input.scenarios.scenarios.map((scenario) => scenario.id),
  );
  agregarDuplicados(
    executions.map((execution) => execution.scenario_id),
    "SCENARIO_EXECUTION_DUPLICATE_ID",
    "El reporte contiene ejecuciones duplicadas para un escenario.",
    violations,
  );
  for (const execution of executions) {
    if (!scenarioIds.has(execution.scenario_id)) {
      violations.push({
        code: "SCENARIO_EXECUTION_UNKNOWN_ID",
        message: `La ejecución apunta a un escenario inexistente: ${execution.scenario_id}.`,
        id: execution.scenario_id,
      });
    }
  }
  const executionById = new Map(
    executions.map((execution) => [execution.scenario_id, execution]),
  );
  for (const scenarioId of scenarioIds) {
    if (!executionById.has(scenarioId)) {
      violations.push({
        code: "SCENARIO_EXECUTION_MISSING",
        message: `El escenario no tiene resultado de ejecución: ${scenarioId}.`,
        id: scenarioId,
      });
    }
  }
  const sqlQuality = input.catalog.sql_quality.map((rule) => {
    const execution = executionById.get(rule.scenario_id);
    const result = execution?.sql
      ? evaluarCalidadSql(execution.sql, rule)
      : {
          ok: false,
          normalized_sql: "",
          violations: [
            {
              code: "SQL_OUTPUT_MISSING",
              message:
                "La regla SQL no recibió la salida compilada del escenario.",
              id: rule.scenario_id,
            },
          ],
          metrics: {
            selects: 0,
            ctes: 0,
            subqueries: 0,
            cases: 0,
            casts: 0,
            synthetic_layers: 0,
          },
        };
    if (!result.ok) violations.push(...result.violations);
    return { scenario_id: rule.scenario_id, result };
  });
  const byStatus = contarPorRuntimeStatus(input.runtime.functions);
  const intentionalCount = input.catalog.intentionally_non_equivalent.length;
  const knownExecutions = [...executionById.values()].filter((execution) =>
    scenarioIds.has(execution.scenario_id),
  );
  const compiled = knownExecutions.filter(
    (execution) => execution.status === "compiled",
  ).length;
  const certifiedCount = contarCertificadosValidos(input, scenarioIds);

  return {
    schema_version: 1,
    metrics: {
      tracked: input.manifest.entries.length,
      implemented: byStatus.implemented_unverified ?? 0,
      certified: certifiedCount,
      intentionally_non_equivalent: intentionalCount,
    },
    inventory: {
      total: input.manifest.entries.length,
      by_surface: contarPorSurface(input.manifest.entries),
    },
    runtime: {
      total: input.runtime.functions.length,
      by_status: byStatus,
    },
    scenarios: {
      total: input.scenarios.scenarios.length,
      compiled,
      rejected: knownExecutions.filter(
        (execution) => execution.status === "rejected",
      ).length,
      certified: certifiedCount,
      intentionally_non_equivalent: intentionalCount,
    },
    certificates: input.catalog.certificates,
    intentionally_non_equivalent: input.catalog.intentionally_non_equivalent,
    sql_quality: sqlQuality,
    violations,
  };
}

export function contarCertificadosValidos(
  input: EntradaConformance,
  scenarioIds: Set<string>,
): number {
  const manifestIds = new Set(input.manifest.entries.map((entry) => entry.id));
  const nonEquivalentIds = new Set(
    input.catalog.intentionally_non_equivalent.map(
      (entry) => entry.scenario_id,
    ),
  );
  return input.catalog.certificates.filter((certificate) => {
    const target = quitarPrefijoScenario(certificate.id);
    const knownTarget = esTargetCertificadoConocido(
      certificate.id,
      scenarioIds,
      manifestIds,
    );
    return (
      Boolean(certificate.reference?.trim()) &&
      Boolean(certificate.golden?.trim()) &&
      knownTarget &&
      !nonEquivalentIds.has(target ?? "")
    );
  }).length;
}

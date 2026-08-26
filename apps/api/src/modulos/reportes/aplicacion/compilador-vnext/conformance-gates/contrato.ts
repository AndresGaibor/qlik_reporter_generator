import type {
  EntradaConformance,
  EntradaInventarioConformance,
  EntradaRuntimeConformance,
  EstadoRuntimeConformance,
  ViolacionConformance,
} from "./tipos.js";

export const REQUIRED_VECTORS = [
  "normal",
  "null",
  "empty",
  "boundary",
  "type_coercion",
];

export function validarContratoConformance(
  input: EntradaConformance,
): ViolacionConformance[] {
  const violations: ViolacionConformance[] = [];
  const manifestEntries = input.manifest.entries;
  const scenarios = input.scenarios.scenarios;
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const functionEntries = manifestEntries.filter(
    (entry) => entry.surface === "qlik_function",
  );

  const actualCounts = contarPorSurface(manifestEntries);
  for (const surface of Object.keys(actualCounts)) {
    if (input.manifest.counts[surface] === undefined) {
      violations.push({
        code: "MANIFEST_SURFACE_COUNT_MISSING",
        message: `El manifiesto no declara el conteo de la superficie ${surface}.`,
        id: surface,
      });
    }
  }
  for (const [surface, expected] of Object.entries(input.manifest.counts)) {
    const actual =
      surface === "total"
        ? manifestEntries.length
        : (actualCounts[surface] ?? 0);
    if (actual !== expected) {
      violations.push({
        code: "MANIFEST_COUNT_MISMATCH",
        message: `El manifiesto declara ${expected} entradas para ${surface}, pero contiene ${actual}.`,
        id: surface,
      });
    }
  }
  agregarDuplicados(
    manifestEntries.map((entry) => entry.id),
    "MANIFEST_DUPLICATE_ID",
    "El manifiesto contiene IDs duplicados.",
    violations,
  );

  const runtimeCounts = contarPorRuntimeStatus(input.runtime.functions);
  const knownRuntimeStatuses = new Set<EstadoRuntimeConformance>([
    "tracked",
    "implemented_unverified",
    "blocked_exact_dependency",
  ]);
  for (const entry of input.runtime.functions) {
    if (!knownRuntimeStatuses.has(entry.status as EstadoRuntimeConformance)) {
      violations.push({
        code: "RUNTIME_STATUS_UNKNOWN",
        message: `Estado runtime desconocido: ${entry.status}.`,
        id: entry.name,
      });
    }
  }
  for (const [status, expected] of Object.entries(input.runtime.counts)) {
    if ((runtimeCounts[status] ?? 0) !== expected) {
      violations.push({
        code: "RUNTIME_COUNT_MISMATCH",
        message: `El estado runtime declara ${expected} entradas ${status}, pero contiene ${runtimeCounts[status] ?? 0}.`,
        id: status,
      });
    }
  }
  if (input.runtime.total !== input.runtime.functions.length) {
    violations.push({
      code: "RUNTIME_TOTAL_MISMATCH",
      message: "El total runtime no coincide con la lista de funciones.",
    });
  }

  if (input.vectors.functions.length !== functionEntries.length) {
    violations.push({
      code: "FUNCTION_VECTOR_COUNT_MISMATCH",
      message:
        "La cantidad de funciones con vectores no coincide con el inventario oficial.",
    });
  }
  const vectorsByKey = new Map(
    input.vectors.functions.map((entry) => [
      claveFuncion(entry.name, entry.category),
      entry,
    ]),
  );
  const manifestFunctionKeys = new Set(
    functionEntries.map((entry) =>
      claveFuncion(entry.name, entry.family ?? ""),
    ),
  );
  for (const entry of input.runtime.functions) {
    if (!manifestFunctionKeys.has(claveFuncion(entry.name, entry.category))) {
      violations.push({
        code: "RUNTIME_FUNCTION_TARGET_UNKNOWN",
        message: `La función runtime no pertenece al inventario oficial: ${entry.name}.`,
        id: entry.name,
      });
    }
  }
  agregarDuplicados(
    input.vectors.functions.map((entry) =>
      claveFuncion(entry.name, entry.category),
    ),
    "FUNCTION_VECTOR_DUPLICATE_ID",
    "La matriz de vectores contiene funciones duplicadas.",
    violations,
  );
  for (const entry of input.vectors.functions) {
    if (!manifestFunctionKeys.has(claveFuncion(entry.name, entry.category))) {
      violations.push({
        code: "FUNCTION_VECTOR_TARGET_UNKNOWN",
        message: `El vector apunta a una función inexistente: ${entry.name}.`,
        id: entry.name,
      });
    }
  }
  const manifestIds = new Set(manifestEntries.map((entry) => entry.id));
  for (const entry of functionEntries) {
    const key = claveFuncion(entry.name, entry.family ?? "");
    const vectors = vectorsByKey.get(key);
    for (const vector of entry.required_vectors ?? REQUIRED_VECTORS) {
      if (!vectors?.vectors.includes(vector)) {
        violations.push({
          code: "FUNCTION_VECTOR_REQUIRED",
          message: `La función ${entry.name} no tiene el vector ${vector}.`,
          id: entry.id,
        });
      }
    }
  }

  agregarDuplicados(
    scenarios.map((scenario) => scenario.id),
    "SCENARIO_DUPLICATE_ID",
    "El corpus contiene escenarios duplicados.",
    violations,
  );

  agregarDuplicados(
    input.catalog.certificates.map((certificate) => certificate.id),
    "CERTIFICATE_DUPLICATE_ID",
    "El catálogo contiene certificados duplicados.",
    violations,
  );
  for (const certificate of input.catalog.certificates) {
    if (!certificate.reference?.trim()) {
      violations.push({
        code: "CERTIFICATE_REFERENCE_REQUIRED",
        message: "Todo certificado debe apuntar a una referencia concreta.",
        id: certificate.id,
      });
    }
    if (!certificate.golden?.trim()) {
      violations.push({
        code: "CERTIFICATE_GOLDEN_REQUIRED",
        message: "Todo certificado debe apuntar a un golden concreto.",
        id: certificate.id,
      });
    }
    const scenarioId = quitarPrefijoScenario(certificate.id);
    const targetKnown = esTargetCertificadoConocido(
      certificate.id,
      scenarioIds,
      manifestIds,
    );
    if (!targetKnown) {
      violations.push({
        code: "CERTIFICATE_TARGET_UNKNOWN",
        message: `El certificado apunta a un target inexistente: ${certificate.id}.`,
        id: certificate.id,
      });
    }
  }

  const noEquivalentIds = input.catalog.intentionally_non_equivalent.map(
    (entry) => entry.scenario_id,
  );
  agregarDuplicados(
    noEquivalentIds,
    "NON_EQUIVALENT_DUPLICATE_ID",
    "El catálogo contiene no-equivalencias duplicadas.",
    violations,
  );
  for (const entry of input.catalog.intentionally_non_equivalent) {
    if (!scenarioIds.has(entry.scenario_id)) {
      violations.push({
        code: "NON_EQUIVALENT_TARGET_UNKNOWN",
        message: `La no-equivalencia apunta a un escenario inexistente: ${entry.scenario_id}.`,
        id: entry.scenario_id,
      });
    }
    if (!entry.reason.trim() || !entry.reference.trim()) {
      violations.push({
        code: "NON_EQUIVALENT_EXPLANATION_REQUIRED",
        message: "Toda no-equivalencia debe explicar la razón y su referencia.",
        id: entry.scenario_id,
      });
    }
    if (
      input.catalog.certificates.some(
        (certificate) =>
          quitarPrefijoScenario(certificate.id) === entry.scenario_id,
      )
    ) {
      violations.push({
        code: "CERTIFICATE_NON_EQUIVALENT_CONFLICT",
        message:
          "Un escenario no puede estar certificado y marcado como no-equivalente.",
        id: entry.scenario_id,
      });
    }
  }

  const qualityIds = input.catalog.sql_quality.map((rule) => rule.scenario_id);
  agregarDuplicados(
    qualityIds,
    "SQL_QUALITY_DUPLICATE_ID",
    "El catálogo contiene reglas SQL duplicadas.",
    violations,
  );
  for (const rule of input.catalog.sql_quality) {
    if (!scenarioIds.has(rule.scenario_id)) {
      violations.push({
        code: "SQL_QUALITY_TARGET_UNKNOWN",
        message: `La regla SQL apunta a un escenario inexistente: ${rule.scenario_id}.`,
        id: rule.scenario_id,
      });
    }
  }

  return violations;
}

export function claveFuncion(name: string, category: string): string {
  return `${name.toLowerCase()}::${category.toLowerCase()}`;
}

export function esTargetCertificadoConocido(
  certificateId: string,
  scenarioIds: Set<string>,
  manifestIds: Set<string>,
): boolean {
  const scenarioId = certificateId.startsWith("scenario:")
    ? certificateId.slice("scenario:".length)
    : undefined;
  return scenarioId
    ? scenarioIds.has(scenarioId)
    : scenarioIds.has(certificateId) || manifestIds.has(certificateId);
}

export function contarPorSurface(
  entries: EntradaInventarioConformance[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries)
    counts[entry.surface] = (counts[entry.surface] ?? 0) + 1;
  return counts;
}

export function contarPorRuntimeStatus(
  entries: EntradaRuntimeConformance[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries)
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  return counts;
}

export function agregarDuplicados(
  values: string[],
  code: string,
  message: string,
  violations: ViolacionConformance[],
): void {
  const duplicates = new Set(
    values.filter((value, index) => values.indexOf(value) !== index),
  );
  for (const id of duplicates) violations.push({ code, message, id });
}

export function quitarPrefijoScenario(id: string): string | undefined {
  return id.startsWith("scenario:")
    ? id.slice("scenario:".length)
    : id || undefined;
}

export type EstadoRuntimeConformance =
  | "tracked"
  | "implemented_unverified"
  | "blocked_exact_dependency";

export interface EntradaInventarioConformance {
  id: string;
  surface: string;
  name: string;
  docs: string;
  strategy: string;
  semantic_status: string;
  required_vectors?: string[];
  family?: string;
}

export interface ManifiestoCoberturaConformance {
  counts: Record<string, number>;
  entries: EntradaInventarioConformance[];
}

export interface EntradaRuntimeConformance {
  name: string;
  category: string;
  docs: string;
  status: string;
  blocker?: string | null;
}

export interface EstadoRuntimeFixtureConformance {
  counts: Record<string, number>;
  total: number;
  functions: EntradaRuntimeConformance[];
}

export interface VectorFuncionConformance {
  name: string;
  category: string;
  vectors: string[];
}

export interface VectoresFuncionConformance {
  functions: VectorFuncionConformance[];
}

export interface EscenarioConformance {
  id: string;
  fixture: string;
  status?: string;
}

export interface EscenariosConformance {
  scenarios: EscenarioConformance[];
}

export interface CertificadoConformance {
  id: string;
  reference?: string;
  golden?: string;
}

export interface NoEquivalenteConformance {
  scenario_id: string;
  reason: string;
  reference: string;
}

export interface SqlQualityExpectation {
  required?: string[];
  forbidden?: string[];
  exact_occurrences?: Record<string, number>;
  min_selects?: number;
  max_selects?: number;
  max_ctes?: number;
  max_subqueries?: number;
  max_cases?: number;
  max_casts?: number;
  max_synthetic_layers?: number;
}

export interface SqlQualityRule extends SqlQualityExpectation {
  scenario_id: string;
}

export interface CatalogoConformance {
  schema_version: number;
  certificates: CertificadoConformance[];
  intentionally_non_equivalent: NoEquivalenteConformance[];
  sql_quality: SqlQualityRule[];
}

export interface EntradaConformance {
  manifest: ManifiestoCoberturaConformance;
  runtime: EstadoRuntimeFixtureConformance;
  scenarios: EscenariosConformance;
  vectors: VectoresFuncionConformance;
  catalog: CatalogoConformance;
}

export interface EjecucionEscenarioConformance {
  scenario_id: string;
  status: "compiled" | "rejected";
  sql?: string;
  diagnostic_code?: string;
}

export interface ViolacionConformance {
  code: string;
  message: string;
  id?: string;
}

export interface MetricasConformance {
  tracked: number;
  implemented: number;
  certified: number;
  intentionally_non_equivalent: number;
}

export interface ResultadoCalidadSql {
  ok: boolean;
  normalized_sql: string;
  violations: ViolacionConformance[];
  metrics: {
    selects: number;
    ctes: number;
    subqueries: number;
    cases: number;
    casts: number;
    synthetic_layers: number;
  };
}

export interface ReporteConformance {
  schema_version: 1;
  metrics: MetricasConformance;
  inventory: {
    total: number;
    by_surface: Record<string, number>;
  };
  runtime: {
    total: number;
    by_status: Record<string, number>;
  };
  scenarios: {
    total: number;
    compiled: number;
    rejected: number;
    certified: number;
    intentionally_non_equivalent: number;
  };
  certificates: CertificadoConformance[];
  intentionally_non_equivalent: NoEquivalenteConformance[];
  sql_quality: Array<{
    scenario_id: string;
    result: ResultadoCalidadSql;
  }>;
  violations: ViolacionConformance[];
}

const REQUIRED_VECTORS = [
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

export function evaluarCalidadSql(
  sql: string,
  expectation: SqlQualityExpectation,
): ResultadoCalidadSql {
  const normalizedSql = normalizarSql(sql);
  const searchable = normalizedSql.toLowerCase();
  const violations: ViolacionConformance[] = [];
  for (const required of expectation.required ?? []) {
    if (!searchable.includes(normalizarSql(required).toLowerCase())) {
      violations.push({
        code: "SQL_REQUIRED_FRAGMENT_MISSING",
        message: `Falta el fragmento SQL requerido: ${required}`,
      });
    }
  }
  for (const forbidden of expectation.forbidden ?? []) {
    const structuralFragment = normalizarSql(
      quitarLiteralesYComentarios(sql),
    ).toLowerCase();
    if (structuralFragment.includes(normalizarSql(forbidden).toLowerCase())) {
      violations.push({
        code: "SQL_FORBIDDEN_FRAGMENT",
        message: `La salida contiene complejidad no permitida: ${forbidden}`,
      });
    }
  }
  for (const [fragment, expected] of Object.entries(
    expectation.exact_occurrences ?? {},
  )) {
    const actual = contarFragmento(
      normalizarSql(quitarLiteralesYComentarios(sql)).toLowerCase(),
      normalizarSql(fragment).toLowerCase(),
    );
    if (actual !== expected) {
      violations.push({
        code: "SQL_OCCURRENCE_MISMATCH",
        message: `El fragmento ${fragment} aparece ${actual} veces; se esperaban ${expected}.`,
      });
    }
  }

  const sanitized = quitarLiteralesYComentarios(sql);
  const metrics = {
    selects: contarKeyword(sanitized, "SELECT"),
    ctes: contarCtes(sanitized),
    subqueries: (sanitized.match(/\(\s*SELECT\b/gi) ?? []).length,
    cases: contarKeyword(sanitized, "CASE"),
    casts: (sanitized.match(/\b(?:SAFE_)?CAST\s*\(/gi) ?? []).length,
    synthetic_layers: (
      normalizarSql(quitarComentariosYStrings(sql)).match(
        /\b(?:fuente|filtro|proyeccion)_\d+\b/gi,
      ) ?? []
    ).length,
  };
  if (
    expectation.min_selects !== undefined &&
    metrics.selects < expectation.min_selects
  ) {
    violations.push({
      code: "SQL_SELECT_COUNT_TOO_LOW",
      message: `La salida tiene ${metrics.selects} SELECT; se requieren al menos ${expectation.min_selects}.`,
    });
  }
  if (
    expectation.max_selects !== undefined &&
    metrics.selects > expectation.max_selects
  ) {
    violations.push({
      code: "SQL_SELECT_COUNT_TOO_HIGH",
      message: `La salida tiene ${metrics.selects} SELECT; se permiten como máximo ${expectation.max_selects}.`,
    });
  }
  const limits: Array<{
    key: keyof typeof metrics;
    expected: number | undefined;
    code: string;
    label: string;
  }> = [
    {
      key: "ctes",
      expected: expectation.max_ctes,
      code: "SQL_CTE_COUNT_TOO_HIGH",
      label: "CTE",
    },
    {
      key: "subqueries",
      expected: expectation.max_subqueries,
      code: "SQL_SUBQUERY_COUNT_TOO_HIGH",
      label: "subquery",
    },
    {
      key: "cases",
      expected: expectation.max_cases,
      code: "SQL_CASE_COUNT_TOO_HIGH",
      label: "CASE",
    },
    {
      key: "casts",
      expected: expectation.max_casts,
      code: "SQL_CAST_COUNT_TOO_HIGH",
      label: "CAST",
    },
    {
      key: "synthetic_layers",
      expected: expectation.max_synthetic_layers,
      code: "SQL_SYNTHETIC_LAYER_COUNT_TOO_HIGH",
      label: "capa sintética",
    },
  ];
  for (const limit of limits) {
    if (limit.expected !== undefined && metrics[limit.key] > limit.expected) {
      violations.push({
        code: limit.code,
        message: `La salida tiene ${metrics[limit.key]} ${limit.label}; se permiten como máximo ${limit.expected}.`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    normalized_sql: normalizedSql,
    violations,
    metrics,
  };
}

function claveFuncion(name: string, category: string): string {
  return `${name.toLowerCase()}::${category.toLowerCase()}`;
}

function contarCertificadosValidos(
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

function esTargetCertificadoConocido(
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

function contarPorSurface(
  entries: EntradaInventarioConformance[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries)
    counts[entry.surface] = (counts[entry.surface] ?? 0) + 1;
  return counts;
}

function contarPorRuntimeStatus(
  entries: EntradaRuntimeConformance[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries)
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  return counts;
}

function agregarDuplicados(
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

function quitarPrefijoScenario(id: string): string | undefined {
  return id.startsWith("scenario:")
    ? id.slice("scenario:".length)
    : id || undefined;
}

function normalizarSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function contarFragmento(text: string, fragment: string): number {
  if (!fragment) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - fragment.length) {
    const index = text.indexOf(fragment, offset);
    if (index === -1) break;
    count += 1;
    offset = index + fragment.length;
  }
  return count;
}

function contarKeyword(sql: string, keyword: string): number {
  return (sql.match(new RegExp(`\\b${keyword}\\b`, "gi")) ?? []).length;
}

function contarCtes(sql: string): number {
  let count = 0;
  const withPattern = /\bWITH\s+(?:RECURSIVE\s+)?/gi;
  while (true) {
    const withMatch = withPattern.exec(sql);
    if (!withMatch) break;
    let cursor = withMatch.index + withMatch[0].length;
    let head = leerCabezaCte(sql, cursor);
    if (!head) continue;
    count += 1;
    cursor = saltarParentesis(sql, head.openParenthesis);
    while (true) {
      const comma = /^\s*,/.exec(sql.slice(cursor));
      if (!comma) break;
      head = leerCabezaCte(sql, cursor + comma[0].length);
      if (!head) break;
      count += 1;
      cursor = saltarParentesis(sql, head.openParenthesis);
    }
  }
  return count;
}

function leerCabezaCte(
  sql: string,
  offset: number,
): { openParenthesis: number } | undefined {
  const match = /^\s*(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)\s+AS\s*\(/.exec(
    sql.slice(offset),
  );
  if (!match) return undefined;
  return {
    openParenthesis: offset + match[0].lastIndexOf("("),
  };
}

function saltarParentesis(sql: string, openParenthesis: number): number {
  let depth = 0;
  for (let index = openParenthesis; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return sql.length;
}

function quitarLiteralesYComentarios(sql: string): string {
  let output = "";
  let quote: "'" | '"' | "`" | undefined;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (!quote && current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      output += " ";
      continue;
    }
    if (!quote && current === "/" && next === "*") {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      )
        index += 1;
      index += 1;
      output += " ";
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) {
        index += 1;
        output += "  ";
      } else if (current === quote) {
        quote = undefined;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      output += " ";
      continue;
    }
    output += current;
  }
  return output;
}

function quitarComentariosYStrings(sql: string): string {
  let output = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (!quote && current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      output += " ";
      continue;
    }
    if (!quote && current === "/" && next === "*") {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      )
        index += 1;
      index += 1;
      output += " ";
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) {
        index += 1;
        output += "  ";
      } else if (current === quote) {
        quote = undefined;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      output += " ";
      continue;
    }
    output += current;
  }
  return output;
}

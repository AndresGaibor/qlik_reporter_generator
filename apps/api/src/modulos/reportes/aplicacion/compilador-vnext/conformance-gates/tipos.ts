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

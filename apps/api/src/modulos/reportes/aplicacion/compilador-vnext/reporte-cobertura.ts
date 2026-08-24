import {
  REGISTRO_FUNCIONES_QLIK,
  type CertificationStatus,
  type RuntimeStatus,
} from "./registro-funciones.js";

export interface ReporteCoberturaFunciones {
  total: number;
  runtime: Record<RuntimeStatus, number>;
  certification: Record<CertificationStatus, number>;
  supported: number;
  byStrategy: Record<string, number>;
  functions: Array<{
    id: string;
    name: string;
    category: string;
    strategy: string;
    runtimeStatus: RuntimeStatus;
    certificationStatus: CertificationStatus;
    requiredVectors: string[];
  }>;
}

export function generarReporteCoberturaFunciones(): ReporteCoberturaFunciones {
  const runtime: Record<RuntimeStatus, number> = { implemented: 0, tracked: 0 };
  const certification: Record<CertificationStatus, number> = {
    unverified: 0,
    certified: 0,
    non_equivalent: 0,
  };
  const byStrategy: Record<string, number> = {};
  let supported = 0;

  for (const entry of REGISTRO_FUNCIONES_QLIK) {
    runtime[entry.runtimeStatus] += 1;
    certification[entry.certificationStatus] += 1;
    byStrategy[entry.strategy] = (byStrategy[entry.strategy] ?? 0) + 1;
    if (
      entry.runtimeStatus === "implemented" &&
      entry.certificationStatus === "certified"
    ) {
      supported += 1;
    }
  }

  return {
    total: REGISTRO_FUNCIONES_QLIK.length,
    runtime,
    certification,
    supported,
    byStrategy,
    functions: REGISTRO_FUNCIONES_QLIK.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      strategy: entry.strategy,
      runtimeStatus: entry.runtimeStatus,
      certificationStatus: entry.certificationStatus,
      requiredVectors: [...entry.requiredVectors],
    })),
  };
}

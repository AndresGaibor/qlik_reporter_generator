import { compilarPlanABigQuery } from "../compilador-bigquery.js";
import { parsearDataflow } from "../parser-dataflow.js";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

export type ResultadoComparado =
  | { status: "compiled"; sql: string }
  | { status: "rejected"; code: string; message: string };

export interface ComparacionCompiladores {
  legacy: ResultadoComparado;
  vnext: ResultadoComparado;
  sameNormalizedSql: boolean;
}

export function compararCompiladores(script: string): ComparacionCompiladores {
  const legacy = ejecutarLegacy(script);
  const vnext = ejecutarVNext(script);
  return {
    legacy,
    vnext,
    sameNormalizedSql:
      legacy.status === "compiled" &&
      vnext.status === "compiled" &&
      normalizarSql(legacy.sql) === normalizarSql(vnext.sql),
  };
}

function ejecutarLegacy(script: string): ResultadoComparado {
  try {
    const plan = parsearDataflow(script);
    if (plan.operacionesNoSoportadas.length > 0) {
      return {
        status: "rejected",
        code: "LEGACY_UNSUPPORTED",
        message: plan.operacionesNoSoportadas
          .map((item) => `${item.operacion}: ${item.detalle}`)
          .join("; "),
      };
    }
    return { status: "compiled", sql: compilarPlanABigQuery(plan).sql };
  } catch (error) {
    return {
      status: "rejected",
      code: "LEGACY_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function ejecutarVNext(script: string): ResultadoComparado {
  try {
    return { status: "compiled", sql: compilarDataflowVNext(script).sql };
  } catch (error) {
    if (error instanceof ErrorCompilacionVNext) {
      return {
        status: "rejected",
        code: error.diagnostic.code,
        message: error.diagnostic.message,
      };
    }
    return {
      status: "rejected",
      code: "VNEXT_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizarSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

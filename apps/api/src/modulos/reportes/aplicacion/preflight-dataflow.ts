import type { PreflightDataflowReporte } from "@qlik/contratos";
import type { PlanDataflow } from "../dominio/plan-dataflow.js";
import { compilarPlanABigQuery } from "./compilador-bigquery.js";
import { parsearDataflow } from "./parser-dataflow.js";

export interface LectorScriptDataflow {
  obtenerScriptApp(
    appId: string,
    scriptId?: string,
  ): Promise<{ script: string; versionMessage?: string }>;
}

export interface EstimadorBigQueryReporte {
  estimarConsulta(
    sql: string,
  ): Promise<{ bytesProcesados: number; costoEstimadoUsd: number }>;
}

export interface AlcanceBigQueryReporte {
  projectId: string;
  dataset: string;
}

export class PreflightDataflow {
  constructor(
    private readonly qlik: LectorScriptDataflow,
    private readonly estimador: EstimadorBigQueryReporte,
    private readonly alcance: AlcanceBigQueryReporte,
  ) {}

  async ejecutar(flujoIdQlik: string): Promise<PreflightDataflowReporte> {
    const { script } = await this.qlik.obtenerScriptApp(flujoIdQlik, "current");
    const hashDataflowSha256 = await sha256Texto(script);
    const plan = parsearDataflow(script);
    const problemasFuentes = normalizarFuentesBigQuery(plan, this.alcance);
    const operacionesNoSoportadas = [
      ...plan.operacionesNoSoportadas.map(
        (item) => `${item.operacion}: ${item.detalle}`,
      ),
      ...problemasFuentes,
    ];
    const resumen = {
      fuentes: plan.fuentes.length,
      filtros: plan.pasos.filter((paso) => paso.tipo === "filtrar").length,
      joins: plan.pasos.filter((paso) => paso.tipo === "join").length,
      camposSalida: plan.salida.campos.length,
    };

    if (operacionesNoSoportadas.length > 0) {
      return {
        flujoIdQlik,
        hashDataflowSha256,
        compatible: false,
        operacionesNoSoportadas,
        sqlBigQuery: "",
        bytesProcesados: 0,
        costoEstimadoUsd: 0,
        resumen,
      };
    }

    const { sql } = compilarPlanABigQuery(plan);
    const estimacion = await this.estimador.estimarConsulta(sql);
    return {
      flujoIdQlik,
      hashDataflowSha256,
      compatible: true,
      operacionesNoSoportadas: [],
      sqlBigQuery: sql,
      bytesProcesados: estimacion.bytesProcesados,
      costoEstimadoUsd: estimacion.costoEstimadoUsd,
      resumen,
    };
  }
}

export async function sha256Texto(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function normalizarFuentesBigQuery(
  plan: PlanDataflow,
  alcance: AlcanceBigQueryReporte,
): string[] {
  const projectId = alcance.projectId.trim();
  const dataset = alcance.dataset.trim();
  const errores: string[] = [];
  if (!projectId || !dataset) {
    return [
      "BigQuery: falta projectId o dataset en la configuración del tenant",
    ];
  }

  for (const fuente of plan.fuentes) {
    const partes = fuente.tabla.split(".");
    if (partes.length === 1) {
      fuente.tabla = `${projectId}.${dataset}.${partes[0]}`;
      continue;
    }
    if (partes.length === 2) {
      const [datasetFuente, tabla] = partes;
      if (datasetFuente !== dataset) {
        errores.push(
          `FuenteBigQuery: ${fuente.tabla} no pertenece al dataset configurado ${dataset}`,
        );
      } else {
        fuente.tabla = `${projectId}.${dataset}.${tabla}`;
      }
      continue;
    }
    if (partes.length === 3) {
      const [proyectoFuente, datasetFuente] = partes;
      if (proyectoFuente !== projectId || datasetFuente !== dataset) {
        errores.push(
          `FuenteBigQuery: ${fuente.tabla} queda fuera de ${projectId}.${dataset}`,
        );
      }
      continue;
    }
    errores.push(`FuenteBigQuery: identificador inválido ${fuente.tabla}`);
  }
  return errores;
}

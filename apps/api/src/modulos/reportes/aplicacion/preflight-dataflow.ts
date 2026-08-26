import type { PreflightDataflowReporte } from "@qlik/contratos";
import type {
  CatalogoMetadataBigQuery,
  MetadataTablaBigQuery,
} from "../../google-cloud/dominio/metadata-bigquery.js";
import type { PlanDataflow } from "../dominio/plan-dataflow.js";
import { compilarDataflowVNext } from "./compilador-vnext/index.js";
import { ErrorCompilacionVNext } from "./compilador-vnext/modelo.js";
import { localizarComponenteDataflow } from "./contexto-diagnostico-dataflow.js";
import { parsearDataflow } from "./parser-dataflow.js";

export interface LectorScriptDataflow {
  obtenerScriptApp(
    appId: string,
    scriptId?: string,
  ): Promise<{ script: string; versionMessage?: string }>;
}

export interface EstimadorBigQueryReporte {
  obtenerMetadataTabla?(tabla: string): Promise<MetadataTablaBigQuery>;
  obtenerEsquemaTabla?(tabla: string): Promise<Record<string, string>>;
  estimarConsulta(
    sql: string,
  ): Promise<{ bytesProcesados: number; costoEstimadoUsd: number }>;
}

export interface AlcanceBigQueryReporte {
  projectId: string;
  dataset: string;
  gcsUri?: string;
  credencialesJson?: string;
  estimador?: EstimadorBigQueryReporte;
}

export interface PreparacionDataflowActual {
  flujoIdQlik: string;
  scriptDataflow: string;
  hashDataflowSha256: string;
  compatible: boolean;
  operacionesNoSoportadas: string[];
  sqlBigQuery: string;
  camposSalida: string[];
  resumen: PreflightDataflowReporte["resumen"];
}

export class PreflightDataflow {
  constructor(
    private readonly qlik: LectorScriptDataflow,
    private readonly estimador: EstimadorBigQueryReporte,
    private readonly alcance: AlcanceBigQueryReporte,
  ) {}

  async ejecutar(
    flujoIdQlik: string,
    appIdQlik = flujoIdQlik,
  ): Promise<PreflightDataflowReporte> {
    const preparacion = await prepararDataflowActual(
      this.qlik,
      flujoIdQlik,
      { ...this.alcance, estimador: this.estimador },
      appIdQlik,
    );
    if (!preparacion.compatible) {
      return {
        flujoIdQlik,
        hashDataflowSha256: preparacion.hashDataflowSha256,
        compatible: false,
        operacionesNoSoportadas: preparacion.operacionesNoSoportadas,
        sqlBigQuery: "",
        bytesProcesados: 0,
        costoEstimadoUsd: 0,
        validacionBigQuery: {
          exitosa: false,
          mensajeError:
            "No se ejecutó el dry-run porque el Dataflow no es compatible",
        },
        resumen: preparacion.resumen,
      };
    }

    try {
      const estimacion = await this.estimador.estimarConsulta(
        preparacion.sqlBigQuery,
      );
      return {
        flujoIdQlik,
        hashDataflowSha256: preparacion.hashDataflowSha256,
        compatible: true,
        operacionesNoSoportadas: [],
        sqlBigQuery: preparacion.sqlBigQuery,
        bytesProcesados: estimacion.bytesProcesados,
        costoEstimadoUsd: estimacion.costoEstimadoUsd,
        validacionBigQuery: { exitosa: true, mensajeError: null },
        resumen: preparacion.resumen,
      };
    } catch (error) {
      return {
        flujoIdQlik,
        hashDataflowSha256: preparacion.hashDataflowSha256,
        compatible: true,
        operacionesNoSoportadas: [],
        sqlBigQuery: preparacion.sqlBigQuery,
        bytesProcesados: 0,
        costoEstimadoUsd: 0,
        validacionBigQuery: {
          exitosa: false,
          mensajeError:
            error instanceof Error
              ? error.message
              : "Error desconocido de BigQuery",
        },
        resumen: preparacion.resumen,
      };
    }
  }
}

export async function prepararDataflowActual(
  qlik: LectorScriptDataflow,
  flujoIdQlik: string,
  alcance: AlcanceBigQueryReporte,
  appIdQlik = flujoIdQlik,
): Promise<PreparacionDataflowActual> {
  const { script } = await qlik.obtenerScriptApp(appIdQlik, "current");
  const hashDataflowSha256 = await sha256Texto(script);
  // LEGACY: parsearDataflow se usa SÓLO para:
  //   1. Validar que todas las fuentes son BigQuery (normalizarFuentesBigQuery)
  //   2. Construir el resumen estadístico (conteos de fuentes, filtros, joins)
  // La generación de SQL se delega 100% al compilador vNext (compilarDataflowVNext).
  const plan = parsearDataflow(script);
  const problemasFuentes = normalizarFuentesBigQuery(plan, alcance);
  const operacionesNoSoportadas = [...problemasFuentes];
  const resumen = {
    fuentes: plan.fuentes.length,
    filtros: plan.pasos.filter((paso) => paso.tipo === "filtrar").length,
    joins: plan.pasos.filter((paso) => paso.tipo === "join").length,
    camposSalida: plan.salida.campos.length,
  };

  if (operacionesNoSoportadas.length > 0) {
    return {
      flujoIdQlik,
      scriptDataflow: script,
      hashDataflowSha256,
      compatible: false,
      operacionesNoSoportadas,
      sqlBigQuery: "",
      camposSalida: plan.salida.campos,
      resumen,
    };
  }

  try {
    const metadata = await obtenerMetadataCamposBigQuery(
      plan,
      alcance.estimador,
    );
    const compilacion = compilarDataflowVNext(script, metadata);
    return {
      flujoIdQlik,
      scriptDataflow: script,
      hashDataflowSha256,
      compatible: true,
      operacionesNoSoportadas: [],
      sqlBigQuery: compilacion.sql,
      camposSalida: plan.salida.campos,
      resumen,
    };
  } catch (error) {
    let detalle: string;
    if (error instanceof ErrorCompilacionVNext) {
      const componente = localizarComponenteDataflow(script, error.diagnostic);
      detalle = `${error.diagnostic.code}: ${componente ? `componente "${componente}": ` : ""}${error.diagnostic.message}`;
    } else {
      detalle =
        error instanceof Error
          ? error.message
          : "El compilador vNext no pudo procesar el Dataflow";
    }
    return {
      flujoIdQlik,
      scriptDataflow: script,
      hashDataflowSha256,
      compatible: false,
      operacionesNoSoportadas: [detalle],
      sqlBigQuery: "",
      camposSalida: plan.salida.campos,
      resumen,
    };
  }
}

async function obtenerMetadataCamposBigQuery(
  plan: PlanDataflow,
  estimador?: EstimadorBigQueryReporte,
): Promise<{
  fieldTypes?: Readonly<Record<string, string>>;
  sourceMetadata?: CatalogoMetadataBigQuery;
}> {
  const obtenerMetadataTabla = estimador?.obtenerMetadataTabla;
  const obtenerEsquemaTabla = estimador?.obtenerEsquemaTabla;
  if (!obtenerMetadataTabla && !obtenerEsquemaTabla) return {};

  const catalogo: Record<string, MetadataTablaBigQuery> = {};
  const schemas: Array<Record<string, string>> = [];
  for (const fuente of plan.fuentes) {
    try {
      if (obtenerMetadataTabla) {
        const metadata = await obtenerMetadataTabla(fuente.tabla);
        catalogo[fuente.tabla] = metadata;
        schemas.push(
          Object.fromEntries(
            Object.entries(metadata.fields).map(([name, field]) => [
              name,
              field.type,
            ]),
          ),
        );
      } else if (obtenerEsquemaTabla) {
        schemas.push(await obtenerEsquemaTabla(fuente.tabla));
      }
    } catch {
      schemas.push({});
    }
  }

  const tipos: Record<string, string> = {};
  const conflictivos = new Set<string>();
  for (const schema of schemas) {
    for (const [field, type] of Object.entries(schema)) {
      const normalized = type.toUpperCase();
      if (tipos[field] && tipos[field] !== normalized) {
        delete tipos[field];
        conflictivos.add(field);
      } else if (!conflictivos.has(field)) {
        tipos[field] = normalized;
      }
    }
  }

  return {
    ...(Object.keys(tipos).length > 0 ? { fieldTypes: tipos } : {}),
    ...(Object.keys(catalogo).length > 0 ? { sourceMetadata: catalogo } : {}),
  };
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
      continue;
    }
    errores.push(`FuenteBigQuery: identificador inválido ${fuente.tabla}`);
  }
  return errores;
}

import { analizarProgramaQlik } from "./compilador-vnext/analizador-semantico/principal.js";
import { parsearProgramaQlik } from "./compilador-vnext/parser-programa/principal.js";
import type { PlanCompilacionVNext, RelacionVNext } from "./compilador-vnext/ir.js";
import { EvaluadorPreview } from "./evaluador-preview.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";

export interface RespuestaVistaPrevia {
  columnas: string[];
  filas: string[][];
  filasMuestreadas: number;
  fuentesMuestreadas: string[];
  contieneAgregaciones: boolean;
  advertencias: string[];
  esMuestra: true;
}

export class VistaPreviaDataflow {
  private readonly qlik: PuertoQlik;
  private readonly bigquery: PuertoLecturaBigQuery;

  constructor(qlik: PuertoQlik, bigquery: PuertoLecturaBigQuery) {
    this.qlik = qlik;
    this.bigquery = bigquery;
  }

  async ejecutar(flujoId: string, appId: string): Promise<RespuestaVistaPrevia> {
    const { script } = await this.qlik.obtenerScriptApp(appId, "current");

    const programa = parsearProgramaQlik(script);
    const plan = analizarProgramaQlik(programa);

    const { fuentes, datosPorFuente } = await this.obtenerMuestrasDePlan(plan);

    const evaluador = new EvaluadorPreview(plan);
    const resultado = evaluador.evaluarInline(datosPorFuente);

    const MAX_FILAS = 10;
    return {
      columnas: resultado.columnas,
      filas: resultado.filas.slice(0, MAX_FILAS),
      filasMuestreadas: resultado.filas.length,
      fuentesMuestreadas: fuentes,
      contieneAgregaciones: resultado.contieneAgregaciones,
      advertencias: resultado.advertencias,
      esMuestra: true,
    };
  }

  private async obtenerMuestrasDePlan(plan: PlanCompilacionVNext): Promise<{
    fuentes: string[];
    datosPorFuente: Record<string, { columnas: string[]; filas: string[][] }>;
  }> {
    const resultado: Record<string, { columnas: string[]; filas: string[][] }> = {};
    const fuentes: string[] = [];

    const nativeSqlRelations = plan.relations.filter(
      (r): r is RelacionVNext & { op: "native_sql" | "autogenerate" } =>
        r.op === "native_sql" || r.op === "autogenerate"
    );

    await Promise.all(
      nativeSqlRelations.map(async (rel) => {
        const tabla = this.extraerNombreTabla(rel);
        fuentes.push(tabla);
        try {
          const data = await this.bigquery.obtenerFilasPreview(tabla, { maxFilas: 100 });
          resultado[rel.id] = data;
        } catch {
          resultado[rel.id] = { columnas: [], filas: [] };
        }
      })
    );

    return { fuentes, datosPorFuente: resultado };
  }

  private extraerNombreTabla(rel: RelacionVNext & { op: "native_sql" | "autogenerate" }): string {
    if ("logicalName" in rel && rel.logicalName) {
      return rel.logicalName;
    }
    if (rel.op === "native_sql" && "sql" in rel) {
      const match = rel.sql.match(/FROM\s+`([^`]+)`/i);
      if (match) {
        return match[1];
      }
    }
    return rel.id;
  }
}

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
    const datosPorId: Record<string, { columnas: string[]; filas: string[][] }> = {};
    const fuentes: string[] = [];

    const esFuente = (r: RelacionVNext): boolean => {
      if (r.op === "native_sql" || r.op === "autogenerate") return true;
      if (r.op === "inline" && r.rows.length > 0) return true;
      return false;
    };

    for (const rel of plan.relations) {
      if (esFuente(rel)) {
        if (rel.op === "inline") {
          datosPorId[rel.id] = { columnas: rel.columns, filas: rel.rows };
          fuentes.push(rel.id);
        } else {
          const tabla = this.extraerNombreTabla(rel as RelacionVNext & { op: "native_sql" | "autogenerate" });
          fuentes.push(tabla);
          try {
            const data = await this.bigquery.obtenerFilasPreview(tabla, { maxFilas: 100 });
            datosPorId[rel.id] = data;
          } catch {
            datosPorId[rel.id] = { columnas: [], filas: [] };
          }
        }
      } else {
        datosPorId[rel.id] = this.computarRelacion(rel, datosPorId);
      }
    }

    return { fuentes, datosPorFuente: datosPorId };
  }

  private computarRelacion(
    rel: RelacionVNext,
    datosPorId: Record<string, { columnas: string[]; filas: string[][] }>,
  ): { columnas: string[]; filas: string[][] } {
    switch (rel.op) {
      case "inline":
        return { columnas: rel.columns, filas: rel.rows };

      case "project": {
        const datos = datosPorId[rel.input];
        if (!datos) return { columnas: [], filas: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const indices = rel.projections.map((p) => ({
          idx: idxPorNombre.get(p.expression) ?? -1,
          alias: p.alias,
          expr: p.expression,
        }));
        const nuevasColumnas = indices.map((i) => i.alias ?? i.expr);
        const nuevasFilas = datos.filas.map((fila) =>
          indices.map((i) => {
            if (i.idx >= 0) return fila[i.idx];
            return i.expr;
          }),
        );
        return { columnas: nuevasColumnas, filas: nuevasFilas };
      }

      case "filter": {
        const datos = datosPorId[rel.input];
        if (!datos) return { columnas: [], filas: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const filasFiltradas = datos.filas.filter((fila) =>
          this.evaluarCondicion(rel.condition, fila, datos.columnas, idxPorNombre),
        );
        return { columnas: datos.columnas, filas: filasFiltradas };
      }

      case "join": {
        const datosLeft = datosPorId[rel.left];
        const datosRight = datosPorId[rel.right];
        if (!datosLeft || !datosRight) return { columnas: [], filas: [] };
        const idxKeyLeft = datosLeft.columnas.indexOf(rel.keys[0]);
        const idxKeyRight = datosRight.columnas.indexOf(rel.keys[0]);
        const filasUnidas: string[][] = [];
        for (const filaLeft of datosLeft.filas) {
          for (const filaRight of datosRight.filas) {
            if (filaLeft[idxKeyLeft] === filaRight[idxKeyRight]) {
              filasUnidas.push([...filaLeft, ...filaRight]);
            }
          }
        }
        return { columnas: [...datosLeft.columnas, ...datosRight.columnas], filas: filasUnidas };
      }

      case "sort": {
        const datos = datosPorId[rel.input];
        if (!datos) return { columnas: [], filas: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const sorted = [...datos.filas].sort((a, b) => {
          for (const order of rel.orderBy) {
            const idx = idxPorNombre.get(order.expression) ?? -1;
            if (idx < 0) continue;
            const cmp = String(a[idx]).localeCompare(String(b[idx]), "es");
            if (cmp !== 0) return order.direction === "desc" ? -cmp : cmp;
          }
          return 0;
        });
        return { columnas: datos.columnas, filas: sorted };
      }

      case "aggregate": {
        const datos = datosPorId[rel.input];
        if (!datos) return { columnas: [], filas: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const nuevasColumnas = rel.projections.map((p) => p.alias ?? p.expression);
        const valores = datos.filas.map((fila) =>
          rel.projections.map((p) => {
            const matchAgg = p.expression.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
            if (matchAgg) {
              const [, , campo] = matchAgg;
              const colIdx = idxPorNombre.get(campo);
              if (colIdx === undefined) return [0];
              return datos.filas.map((r) => {
                const v = Number(r[colIdx]);
                return Number.isNaN(v) ? 0 : v;
              });
            }
            const idx = idxPorNombre.get(p.expression) ?? -1;
            if (idx >= 0) return [Number(fila[idx])];
            return [0];
          }),
        );
        const resumen: number[] = [];
        for (let colIdx = 0; colIdx < nuevasColumnas.length; colIdx++) {
          let aggregated: number;
          const colValues = valores.flatMap((rowVals) => {
            const v = rowVals[colIdx];
            return Array.isArray(v) ? v : [v];
          });
          const nums = colValues.length > 0 ? colValues : [0];
          const matchAgg = rel.projections[colIdx]?.expression.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
          const func = matchAgg?.[1]?.toUpperCase();
          switch (func) {
            case "SUM": aggregated = nums.reduce((a, b) => a + b, 0); break;
            case "AVG": aggregated = nums.reduce((a, b) => a + b, 0) / nums.length; break;
            case "COUNT": aggregated = nums.length; break;
            case "MIN": aggregated = Math.min(...nums); break;
            case "MAX": aggregated = Math.max(...nums); break;
            default: aggregated = nums.reduce((a, b) => a + b, 0) / nums.length;
          }
          resumen.push(aggregated);
        }
        const resultado = rel.groupBy.length === 0 ? [resumen.map((v) => String(v))] : [];
        return { columnas: nuevasColumnas, filas: resultado };
      }

      default:
        return { columnas: [], filas: [] };
    }
  }

  private evaluarCondicion(
    condition: string,
    fila: string[],
    columnas: string[],
    idxPorNombre: Map<string, number>,
  ): boolean {
    const match = condition.match(/^(\w+)\s*(>|<|>=|<=|=|!=|<>)\s*(.+)$/);
    if (!match) return true;
    const [, campo, op, rawValor] = match;
    const idx = idxPorNombre.get(campo);
    if (idx === undefined) return true;
    const valorCampo = fila[idx];
    const valorComparacion = rawValor.replace(/^'|'$/g, "");
    const numCampo = Number(valorCampo);
    const numComparacion = Number(valorComparacion);

    if (!Number.isNaN(numCampo) && !Number.isNaN(numComparacion)) {
      switch (op) {
        case ">": return numCampo > numComparacion;
        case ">=": return numCampo >= numComparacion;
        case "<": return numCampo < numComparacion;
        case "<=": return numCampo <= numComparacion;
        case "=": return numCampo === numComparacion;
        case "!=":
        case "<>": return numCampo !== numComparacion;
      }
    }
    switch (op) {
      case "=": return valorCampo === valorComparacion;
      case "!=":
      case "<>": return valorCampo !== valorComparacion;
      default: return true;
    }
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

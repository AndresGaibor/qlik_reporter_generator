import type { PlanCompilacionVNext, RelacionVNext } from "./compilador-vnext/ir.js";

export interface ResultadoEvaluacionPreview {
  columnas: string[];
  filas: string[][];
  contieneAgregaciones: boolean;
  advertencias: string[];
}

export class EvaluadorPreview {
  private readonly plan: PlanCompilacionVNext;

  constructor(plan: PlanCompilacionVNext) {
    this.plan = plan;
  }

  evaluar(datos: { columnas: string[]; filas: string[][] }): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
    return this.aplicarRelacion(outputRelation, new Map([["fuente1", datos]]));
  }

  evaluarInline(
    ...datosPorRelacionArr: Record<string, { columnas: string[]; filas: string[][] }>[]
  ): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
    const merged: Record<string, { columnas: string[]; filas: string[][] }> = {};
    for (const datosPorRelacion of datosPorRelacionArr) {
      Object.assign(merged, datosPorRelacion);
    }
    const mapa = new Map(Object.entries(merged));
    return this.aplicarRelacion(outputRelation, mapa);
  }

  private aplicarRelacion(
    relacion: RelacionVNext,
    datosPorId: Map<string, { columnas: string[]; filas: string[][] }>,
  ): ResultadoEvaluacionPreview {
    switch (relacion.op) {
      case "inline":
        return { columnas: relacion.columns, filas: relacion.rows, contieneAgregaciones: false, advertencias: [] };

      case "project": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const indices = relacion.projections.map((p) => ({
          idx: idxPorNombre.get(p.expression) ?? -1,
          alias: p.alias,
          expr: p.expression,
        }));
        const nuevasColumnas = indices.map((i) => i.alias ?? i.expr);
        const nuevasFilas = datos.filas.map((fila) =>
          indices.map((i) => {
            if (i.idx >= 0) return fila[i.idx];
            return this.evaluarExpresion(i.expr, fila, datos.columnas);
          }),
        );
        return { columnas: nuevasColumnas, filas: nuevasFilas, contieneAgregaciones: false, advertencias: [] };
      }

      case "filter": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const filasFiltradas = datos.filas.filter((fila) =>
          this.evaluarCondicion(relacion.condition, fila, datos.columnas, idxPorNombre),
        );
        return { columnas: datos.columnas, filas: filasFiltradas, contieneAgregaciones: false, advertencias: [] };
      }

      case "aggregate": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const nuevasColumnas = relacion.projections.map((p) => p.alias ?? p.expression);

        const valores = datos.filas.map((fila) =>
          relacion.projections.map((p) => {
            const matchAgg = p.expression.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
            if (matchAgg) {
              const [, func, campo] = matchAgg;
              const colIdx = idxPorNombre.get(campo);
              if (colIdx === undefined) return 0;
              return datos.filas.map((r) => {
                const v = Number(r[colIdx]);
                return Number.isNaN(v) ? 0 : v;
              });
            }
            const idx = idxPorNombre.get(p.expression) ?? -1;
            if (idx >= 0) return [Number(fila[idx])];
            const val = this.evaluarExpresion(p.expression, fila, datos.columnas);
            const n = Number(val);
            return [Number.isNaN(n) ? 0 : n];
          }),
        );

        const resumen: number[] = [];
        for (let colIdx = 0; colIdx < nuevasColumnas.length; colIdx++) {
          let aggregated: number;
          const colValues = valores.map((rowVals) => {
            const v = rowVals[colIdx];
            return Array.isArray(v) ? v : [v];
          }).flat();
          const nums = colValues.length > 0 ? colValues : [0];
          const matchAgg = relacion.projections[colIdx]?.expression.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
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

        const resultado = relacion.groupBy.length === 0
          ? [resumen.map((v) => String(v))]
          : [];
        return { columnas: nuevasColumnas, filas: resultado, contieneAgregaciones: true, advertencias: [] };
      }

      case "join": {
        const datosLeft = datosPorId.get(relacion.left);
        const datosRight = datosPorId.get(relacion.right);
        if (!datosLeft || !datosRight) {
          return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        }
        const idxKeyLeft = datosLeft.columnas.indexOf(relacion.keys[0]);
        const idxKeyRight = datosRight.columnas.indexOf(relacion.keys[0]);
        const filasUnidas: string[][] = [];
        let hayCoincidencias = false;

        for (const filaLeft of datosLeft.filas) {
          for (const filaRight of datosRight.filas) {
            if (filaLeft[idxKeyLeft] === filaRight[idxKeyRight]) {
              hayCoincidencias = true;
              filasUnidas.push([...filaLeft, ...filaRight]);
            }
          }
        }

        const advertencias = hayCoincidencias
          ? []
          : ["La muestra no contiene suficientes coincidencias para representar completamente este join."];
        return {
          columnas: [...datosLeft.columnas, ...datosRight.columnas],
          filas: filasUnidas,
          contieneAgregaciones: false,
          advertencias,
        };
      }

      case "sort": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const sorted = [...datos.filas].sort((a, b) => {
          for (const order of relacion.orderBy) {
            const idx = idxPorNombre.get(order.expression) ?? -1;
            if (idx < 0) continue;
            const cmp = String(a[idx]).localeCompare(String(b[idx]), "es");
            if (cmp !== 0) return order.direction === "desc" ? -cmp : cmp;
          }
          return 0;
        });
        return { columnas: datos.columnas, filas: sorted, contieneAgregaciones: false, advertencias: [] };
      }

      default:
        return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
  }

  private evaluarExpresion(expr: string, fila: string[], columnas: string[]): string {
    const idxPorNombre = new Map(columnas.map((c, i) => [c, i]));

    const matchLeft = expr.match(/^LEFT\((\w+),(\d+)\)$/i);
    if (matchLeft) {
      const [, campo, n] = matchLeft;
      const idx = idxPorNombre.get(campo);
      if (idx !== undefined) return (fila[idx] ?? "").slice(0, Number(n));
    }

    const matchRight = expr.match(/^RIGHT\((\w+),(\d+)\)$/i);
    if (matchRight) {
      const [, campo, n] = matchRight;
      const idx = idxPorNombre.get(campo);
      if (idx !== undefined) return (fila[idx] ?? "").slice(-Number(n));
    }

    const matchAgg = expr.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
    if (matchAgg) {
      return expr;
    }

    const idx = idxPorNombre.get(expr);
    if (idx !== undefined) return fila[idx] ?? "";

    return expr;
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
}

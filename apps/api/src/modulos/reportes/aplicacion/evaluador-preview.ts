import type {
  PlanCompilacionVNext,
  RelacionVNext,
} from "./compilador-vnext/ir.js";

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

  evaluar(datos: {
    columnas: string[];
    filas: string[][];
  }): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return {
        columnas: [],
        filas: [],
        contieneAgregaciones: false,
        advertencias: [],
      };
    }
    return this.aplicarRelacion(outputRelation, new Map([["fuente1", datos]]));
  }

  evaluarInline(
    datosDeFuentes: Record<string, { columnas: string[]; filas: string[][] }>,
  ): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return {
        columnas: [],
        filas: [],
        contieneAgregaciones: false,
        advertencias: [],
      };
    }
    const mapa = new Map(Object.entries(datosDeFuentes));
    return this.aplicarRelacion(outputRelation, mapa);
  }

  private aplicarRelacion(
    relacion: RelacionVNext,
    datosPorId: Map<string, { columnas: string[]; filas: string[][] }>,
  ): ResultadoEvaluacionPreview {
    if (datosPorId.has(relacion.id)) {
      const datos = datosPorId.get(relacion.id);
      if (datos) {
        return {
          columnas: datos.columnas,
          filas: datos.filas,
          contieneAgregaciones: false,
          advertencias: [],
        };
      }
    }

    switch (relacion.op) {
      case "inline":
        return {
          columnas: relacion.columns,
          filas: relacion.rows,
          contieneAgregaciones: false,
          advertencias: [],
        };

      case "project": {
        const inputRel = this.plan.relations.find(
          (r) => r.id === relacion.input,
        );
        let advertencias: string[] = [];
        let contieneAgregaciones = false;
        if (inputRel) {
          const resultInput = this.aplicarRelacion(inputRel, datosPorId);
          datosPorId.set(relacion.input, {
            columnas: resultInput.columnas,
            filas: resultInput.filas,
          });
          advertencias = resultInput.advertencias;
          contieneAgregaciones = resultInput.contieneAgregaciones;
        }
        const datos = datosPorId.get(relacion.input);
        if (!datos)
          return {
            columnas: [],
            filas: [],
            contieneAgregaciones,
            advertencias,
          };
        const idxPorNombre = this.crearIndiceColumnas(datos.columnas);
        const indices = relacion.projections.map((p) => ({
          idx: idxPorNombre.get(this.normalizarReferenciaCampo(p.expression)) ?? -1,
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
        return {
          columnas: nuevasColumnas,
          filas: nuevasFilas,
          contieneAgregaciones,
          advertencias,
        };
      }

      case "filter": {
        const inputRel = this.plan.relations.find(
          (r) => r.id === relacion.input,
        );
        let advertencias: string[] = [];
        let contieneAgregaciones = false;
        if (inputRel) {
          const resultInput = this.aplicarRelacion(inputRel, datosPorId);
          datosPorId.set(relacion.input, {
            columnas: resultInput.columnas,
            filas: resultInput.filas,
          });
          advertencias = resultInput.advertencias;
          contieneAgregaciones = resultInput.contieneAgregaciones;
        }
        const datos = datosPorId.get(relacion.input);
        if (!datos)
          return {
            columnas: [],
            filas: [],
            contieneAgregaciones,
            advertencias,
          };
        const idxPorNombre = this.crearIndiceColumnas(datos.columnas);
        const filasFiltradas = datos.filas.filter((fila) =>
          this.evaluarCondicion(
            relacion.condition,
            fila,
            datos.columnas,
            idxPorNombre,
          ),
        );
        return {
          columnas: datos.columnas,
          filas: filasFiltradas,
          contieneAgregaciones,
          advertencias,
        };
      }

      case "aggregate": {
        const inputRel = this.plan.relations.find(
          (r) => r.id === relacion.input,
        );
        let advertencias: string[] = [];
        if (inputRel) {
          const resultInput = this.aplicarRelacion(inputRel, datosPorId);
          datosPorId.set(relacion.input, {
            columnas: resultInput.columnas,
            filas: resultInput.filas,
          });
          advertencias = resultInput.advertencias;
        }
        const datos = datosPorId.get(relacion.input);
        if (!datos)
          return {
            columnas: [],
            filas: [],
            contieneAgregaciones: true,
            advertencias,
          };
        const idxPorNombre = this.crearIndiceColumnas(datos.columnas);
        const nuevasColumnas = relacion.projections.map(
          (p) => p.alias ?? p.expression,
        );

        if (relacion.groupBy.length === 0) {
          const resumen = relacion.projections.map((proyeccion) => {
            const matchAgg = proyeccion.expression.match(
              /^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/i,
            );
            if (!matchAgg) {
              const primeraFila = datos.filas[0] ?? [];
              return this.evaluarExpresion(
                proyeccion.expression,
                primeraFila,
                datos.columnas,
              );
            }

            const funcion = matchAgg[1].toUpperCase();
            const campo = this.normalizarReferenciaCampo(matchAgg[2]);
            if (funcion === "COUNT" && campo === "*") {
              return String(datos.filas.length);
            }
            const indiceCampo = idxPorNombre.get(campo);
            if (indiceCampo === undefined) return "0";
            const valores = datos.filas.map((fila) => {
              const valor = Number(fila[indiceCampo]);
              return Number.isNaN(valor) ? 0 : valor;
            });

            switch (funcion) {
              case "SUM":
                return String(
                  valores.reduce((total, valor) => total + valor, 0),
                );
              case "AVG":
                return String(
                  valores.length > 0
                    ? valores.reduce((total, valor) => total + valor, 0) /
                        valores.length
                    : 0,
                );
              case "COUNT":
                return String(valores.length);
              case "MIN":
                return String(valores.length > 0 ? Math.min(...valores) : 0);
              case "MAX":
                return String(valores.length > 0 ? Math.max(...valores) : 0);
              default:
                return "0";
            }
          });
          return {
            columnas: nuevasColumnas,
            filas: [resumen],
            contieneAgregaciones: true,
            advertencias,
          };
        }

        const groupByIndices = relacion.groupBy.map(
          (g) => idxPorNombre.get(this.normalizarReferenciaCampo(g)) ?? -1,
        );
        const grupos = new Map<string, string[][]>();
        for (const fila of datos.filas) {
          const clave = groupByIndices
            .map((idx) => (idx >= 0 ? fila[idx] : ""))
            .join("|");
          if (!grupos.has(clave)) grupos.set(clave, []);
          const grupo = grupos.get(clave);
          if (grupo) grupo.push(fila);
        }

        const resultados: string[][] = [];
        for (const [, filasGrupo] of grupos) {
          const resumenFila: string[] = [];
          for (let colIdx = 0; colIdx < relacion.projections.length; colIdx++) {
            const p = relacion.projections[colIdx];
            const matchAgg = p.expression.match(
              /^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/i,
            );
            if (matchAgg) {
              const [, func, campoCrudo] = matchAgg;
              const campo = this.normalizarReferenciaCampo(campoCrudo);
              const colIdx = idxPorNombre.get(campo);
              const valores =
                colIdx !== undefined
                  ? filasGrupo.map((r) => {
                      const v = Number(r[colIdx]);
                      return Number.isNaN(v) ? 0 : v;
                    })
                  : [];
              let aggregated: number;
              switch (func.toUpperCase()) {
                case "SUM":
                  aggregated = valores.reduce((a, b) => a + b, 0);
                  break;
                case "AVG":
                  aggregated =
                    valores.length > 0
                      ? valores.reduce((a, b) => a + b, 0) / valores.length
                      : 0;
                  break;
                case "COUNT":
                  aggregated = valores.length;
                  break;
                case "MIN":
                  aggregated = valores.length > 0 ? Math.min(...valores) : 0;
                  break;
                case "MAX":
                  aggregated = valores.length > 0 ? Math.max(...valores) : 0;
                  break;
                default:
                  aggregated = valores.reduce((a, b) => a + b, 0);
              }
              resumenFila.push(String(aggregated));
            } else {
              resumenFila.push(
                this.evaluarExpresion(
                  p.expression,
                  filasGrupo[0] ?? [],
                  datos.columnas,
                ),
              );
            }
          }
          resultados.push(resumenFila);
        }

        return {
          columnas: nuevasColumnas,
          filas: resultados,
          contieneAgregaciones: true,
          advertencias,
        };
      }

      case "join": {
        const leftRel = this.plan.relations.find((r) => r.id === relacion.left);
        const rightRel = this.plan.relations.find(
          (r) => r.id === relacion.right,
        );
        let advertencias: string[] = [];
        let contieneAgregaciones = false;
        if (leftRel) {
          const resultLeft = this.aplicarRelacion(leftRel, datosPorId);
          datosPorId.set(relacion.left, {
            columnas: resultLeft.columnas,
            filas: resultLeft.filas,
          });
          advertencias = [...advertencias, ...resultLeft.advertencias];
          contieneAgregaciones ||= resultLeft.contieneAgregaciones;
        }
        if (rightRel) {
          const resultRight = this.aplicarRelacion(rightRel, datosPorId);
          datosPorId.set(relacion.right, {
            columnas: resultRight.columnas,
            filas: resultRight.filas,
          });
          advertencias = [...advertencias, ...resultRight.advertencias];
          contieneAgregaciones ||= resultRight.contieneAgregaciones;
        }
        const datosLeft = datosPorId.get(relacion.left);
        const datosRight = datosPorId.get(relacion.right);
        if (!datosLeft || !datosRight) {
          return {
            columnas: [],
            filas: [],
            contieneAgregaciones,
            advertencias,
          };
        }
        const { filasLeft, filasRight } = this.armonizarClavesJoin(
          datosLeft,
          datosRight,
          relacion.keys,
        );
        const indicesLeft = this.crearIndiceColumnas(datosLeft.columnas);
        const indicesRight = this.crearIndiceColumnas(datosRight.columnas);
        const indicesKeyLeft = relacion.keys.map((key) =>
          indicesLeft.get(this.normalizarReferenciaCampo(key)) ?? -1,
        );
        const indicesKeyRight = relacion.keys.map((key) =>
          indicesRight.get(this.normalizarReferenciaCampo(key)) ?? -1,
        );
        const coincideJoin = (filaLeft: string[], filaRight: string[]) =>
          indicesKeyLeft.every(
            (idxLeft, indice) =>
              idxLeft >= 0 &&
              indicesKeyRight[indice] >= 0 &&
              filaLeft[idxLeft] === filaRight[indicesKeyRight[indice]],
          );
        const filasUnidas: string[][] = [];
        const nullsRight = new Array(datosRight.columnas.length).fill("");
        const nullsLeft = new Array(datosLeft.columnas.length).fill("");

        if (relacion.join === "inner") {
          for (const filaLeft of filasLeft) {
            for (const filaRight of filasRight) {
              if (coincideJoin(filaLeft, filaRight)) {
                filasUnidas.push([...filaLeft, ...filaRight]);
              }
            }
          }
        } else if (relacion.join === "left") {
          const rightMatched = new Set<number>();
          for (const filaLeft of filasLeft) {
            let matched = false;
            for (let ri = 0; ri < filasRight.length; ri++) {
              const filaRight = filasRight[ri];
              if (coincideJoin(filaLeft, filaRight)) {
                matched = true;
                rightMatched.add(ri);
                filasUnidas.push([...filaLeft, ...filaRight]);
              }
            }
            if (!matched) {
              filasUnidas.push([...filaLeft, ...nullsRight]);
            }
          }
        } else if (relacion.join === "right") {
          const leftMatched = new Set<number>();
          for (const filaRight of filasRight) {
            let matched = false;
            for (let li = 0; li < filasLeft.length; li++) {
              const filaLeft = filasLeft[li];
              if (coincideJoin(filaLeft, filaRight)) {
                matched = true;
                leftMatched.add(li);
                filasUnidas.push([...filaLeft, ...filaRight]);
              }
            }
            if (!matched) {
              filasUnidas.push([...nullsLeft, ...filaRight]);
            }
          }
        } else if (relacion.join === "full") {
          const leftMatched = new Set<number>();
          const rightMatched = new Set<number>();
          for (const filaLeft of filasLeft) {
            let matched = false;
            for (let ri = 0; ri < filasRight.length; ri++) {
              const filaRight = filasRight[ri];
              if (coincideJoin(filaLeft, filaRight)) {
                matched = true;
                leftMatched.add(filasLeft.indexOf(filaLeft));
                rightMatched.add(ri);
                filasUnidas.push([...filaLeft, ...filaRight]);
              }
            }
            if (!matched) {
              filasUnidas.push([...filaLeft, ...nullsRight]);
            }
          }
          for (let ri = 0; ri < filasRight.length; ri++) {
            if (!rightMatched.has(ri)) {
              filasUnidas.push([...nullsLeft, ...filasRight[ri]]);
            }
          }
        }

        return {
          columnas: [...datosLeft.columnas, ...datosRight.columnas],
          filas: filasUnidas,
          contieneAgregaciones,
          advertencias,
        };
      }

      case "sort": {
        const inputRel = this.plan.relations.find(
          (r) => r.id === relacion.input,
        );
        if (inputRel) {
          const resultInput = this.aplicarRelacion(inputRel, datosPorId);
          datosPorId.set(relacion.input, {
            columnas: resultInput.columnas,
            filas: resultInput.filas,
          });
        }
        const datos = datosPorId.get(relacion.input);
        if (!datos)
          return {
            columnas: [],
            filas: [],
            contieneAgregaciones: false,
            advertencias: [],
          };
        const idxPorNombre = this.crearIndiceColumnas(datos.columnas);
        const sorted = [...datos.filas].sort((a, b) => {
          for (const order of relacion.orderBy) {
            const idx =
              idxPorNombre.get(this.normalizarReferenciaCampo(order.expression)) ?? -1;
            if (idx < 0) continue;
            const cmp = String(a[idx]).localeCompare(String(b[idx]), "es");
            if (cmp !== 0) return order.direction === "desc" ? -cmp : cmp;
          }
          return 0;
        });
        return {
          columnas: datos.columnas,
          filas: sorted,
          contieneAgregaciones: false,
          advertencias: [],
        };
      }

      default:
        return {
          columnas: [],
          filas: [],
          contieneAgregaciones: false,
          advertencias: [],
        };
    }
  }

  private evaluarExpresion(
    expr: string,
    fila: string[],
    columnas: string[],
  ): string {
    const idxPorNombre = this.crearIndiceColumnas(columnas);
    const expresion = expr.trim();

    const matchFuncionTexto = expresion.match(/^(LEFT|RIGHT)\((.+),(\d+)\)$/i);
    if (matchFuncionTexto) {
      const [, funcion, campoCrudo, n] = matchFuncionTexto;
      const campo = this.normalizarReferenciaCampo(campoCrudo);
      const idx = idxPorNombre.get(this.normalizarReferenciaCampo(campo));
      if (idx !== undefined) {
        const valor = fila[idx] ?? "";
        return funcion.toUpperCase() === "LEFT"
          ? valor.slice(0, Number(n))
          : valor.slice(-Number(n));
      }
    }

    const literalTexto = expresion.match(/^(['"])(.*)\1$/s);
    if (literalTexto) return literalTexto[2];

    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(expresion)) {
      return expresion;
    }

    const referencia = this.normalizarReferenciaCampo(expresion);
    const idx = idxPorNombre.get(referencia);
    if (idx !== undefined) return fila[idx] ?? "";

    return "";
  }

  private normalizarReferenciaCampo(valor: string): string {
    const limpio = valor.trim();
    const sinDelimitadores =
      ((limpio.startsWith("[") && limpio.endsWith("]")) ||
        (limpio.startsWith("`") && limpio.endsWith("`")))
        ? limpio.slice(1, -1)
        : limpio;
    return sinDelimitadores
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private crearIndiceColumnas(columnas: string[]): Map<string, number> {
    return new Map(
      columnas.map((columna, indice) => [
        this.normalizarReferenciaCampo(columna),
        indice,
      ]),
    );
  }

  private armonizarClavesJoin(
    datosLeft: { columnas: string[]; filas: string[][] },
    datosRight: { columnas: string[]; filas: string[][] },
    claves: string[],
  ): { filasLeft: string[][]; filasRight: string[][] } {
    const filasLeft = datosLeft.filas.map((fila) => [...fila]);
    const filasRight = datosRight.filas.map((fila) => [...fila]);
    const pares = Math.min(filasLeft.length, filasRight.length);

    for (const clave of claves) {
      const idxLeft = this.crearIndiceColumnas(datosLeft.columnas).get(
        this.normalizarReferenciaCampo(clave),
      ) ?? -1;
      const idxRight = this.crearIndiceColumnas(datosRight.columnas).get(
        this.normalizarReferenciaCampo(clave),
      ) ?? -1;
      if (idxLeft < 0 || idxRight < 0) continue;

      for (let indice = 0; indice < pares; indice++) {
        const valorArmonizado = `__preview_join_${indice + 1}`;
        filasLeft[indice][idxLeft] = valorArmonizado;
        filasRight[indice][idxRight] = valorArmonizado;
      }
    }

    return { filasLeft, filasRight };
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
    const idx = idxPorNombre.get(this.normalizarReferenciaCampo(campo));
    if (idx === undefined) return true;
    const valorCampo = fila[idx];
    const valorComparacion = rawValor.replace(/^'|'$/g, "");
    const numCampo = Number(valorCampo);
    const numComparacion = Number(valorComparacion);

    if (!Number.isNaN(numCampo) && !Number.isNaN(numComparacion)) {
      switch (op) {
        case ">":
          return numCampo > numComparacion;
        case ">=":
          return numCampo >= numComparacion;
        case "<":
          return numCampo < numComparacion;
        case "<=":
          return numCampo <= numComparacion;
        case "=":
          return numCampo === numComparacion;
        case "!=":
        case "<>":
          return numCampo !== numComparacion;
      }
    }
    switch (op) {
      case "=":
        return valorCampo === valorComparacion;
      case "!=":
      case "<>":
        return valorCampo !== valorComparacion;
      default:
        return true;
    }
  }
}

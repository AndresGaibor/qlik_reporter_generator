import type { PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import type { CampoLoadVNext } from "./parser-carga.js";

function descorchetar(nombre: string): string {
  if (nombre.startsWith("[") && nombre.endsWith("]")) {
    return nombre.slice(1, -1);
  }
  return nombre;
}

/**
 * Optimiza y colapsa el grafo de relaciones IR de compilador-vnext:
 * 1. Proyecciones identidad: Si un `project` no transforma expresiones ni aplica distinct/mapping,
 *    y selecciona exactamente los campos de su input, se elimina redirigiendo los inputs.
 * 2. Colapso de project sobre aggregate: Si un `project` final solo renombra o agrega constantes
 *    sobre un `aggregate`, se pueden fusionar las proyecciones en el `aggregate` final.
 */
export function optimizarPlanRelacionalVNext(plan: PlanCompilacionVNext): PlanCompilacionVNext {
  let relations = [...plan.relations];
  let outputId = plan.outputRelationId;

  let byId = new Map(relations.map((r) => [r.id, r]));

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    for (let i = 0; i < relations.length; i++) {
      const rel = relations[i];
      if (rel.op === "project") {
        const inputRel = byId.get(rel.input);
        if (!inputRel) continue;

        // Comprobar si es proyección identidad pura:
        const isIdentity =
          !rel.distinct &&
          (!rel.mappingLookups || rel.mappingLookups.length === 0) &&
          (!rel.mapSubstringLookups || rel.mapSubstringLookups.length === 0) &&
          (!rel.dualExpressions || Object.keys(rel.dualExpressions).length === 0) &&
          rel.projections.every(
            (p) =>
              descorchetar(p.expression) === (p.alias || p.name) &&
              inputRel.fields.includes(p.alias)
          ) &&
          rel.fields.length === inputRel.fields.length &&
          rel.fields.every((f, idx) => f === inputRel.fields[idx]);

        // Si es identidad y su entrada ya es un project o filter sobre project
        if (isIdentity && (inputRel.op === "project" || inputRel.op === "filter")) {
          const targetId = rel.input;
          relations = relations
            .filter((r) => r.id !== rel.id)
            .map((r) => redirigirReferencia(r, rel.id, targetId));

          if (outputId === rel.id) {
            outputId = targetId;
          }

          byId = new Map(relations.map((r) => [r.id, r]));
          changed = true;
          break;
        }

        // Colapso de project de salida sobre aggregate:
        // Si `rel` es la salida final, no tiene distinct, ni mappingLookups,
        // y su entrada `inputRel` es un `aggregate`.
        if (
          rel.id === outputId &&
          !rel.distinct &&
          (!rel.mappingLookups || rel.mappingLookups.length === 0) &&
          (!rel.mapSubstringLookups || rel.mapSubstringLookups.length === 0) &&
          inputRel.op === "aggregate"
        ) {
          const inputProjectionsMap = new Map<string, CampoLoadVNext>();
          for (const p of inputRel.projections) {
            inputProjectionsMap.set(p.alias || p.name, p);
          }

          // Verificar si todas las proyecciones del project son constantes o referencias directas a campos del aggregate
          let canInline = true;
          const inlinedProjections: CampoLoadVNext[] = [];

          for (const p of rel.projections) {
            const rawExpr = descorchetar(p.expression);
            if (inputProjectionsMap.has(rawExpr)) {
              // Referencia a un campo agregado existente
              const orig = inputProjectionsMap.get(rawExpr)!;
              inlinedProjections.push({
                ...orig,
                alias: p.alias || p.name,
              });
            } else if (
              p.expression.startsWith("'") ||
              /^\d+(\.\d+)?$/.test(p.expression) ||
              p.expression === "''" ||
              p.expression === "0"
            ) {
              // Constante literal
              inlinedProjections.push(p);
            } else {
              canInline = false;
              break;
            }
          }

          if (canInline) {
            const updatedAggregate: RelacionVNext = {
              ...inputRel,
              projections: inlinedProjections,
              fields: rel.fields,
            };

            relations = relations
              .filter((r) => r.id !== rel.id)
              .map((r) => (r.id === inputRel.id ? updatedAggregate : r));

            outputId = inputRel.id;
            byId = new Map(relations.map((r) => [r.id, r]));
            changed = true;
            break;
          }
        }
      }
    }
  }

  return {
    ...plan,
    relations,
    outputRelationId: outputId,
  };
}

function redirigirReferencia(
  rel: RelacionVNext,
  fromId: string,
  toId: string,
): RelacionVNext {
  switch (rel.op) {
    case "filter":
    case "project":
    case "aggregate":
    case "sort":
    case "limit":
    case "semi_filter":
    case "unpivot":
    case "generic":
    case "stateful":
      if (rel.input === fromId) {
        return { ...rel, input: toId } as RelacionVNext;
      }
      return rel;
    case "join": {
      let updated = false;
      let left = rel.left;
      let right = rel.right;
      if (left === fromId) {
        left = toId;
        updated = true;
      }
      if (right === fromId) {
        right = toId;
        updated = true;
      }
      return updated ? ({ ...rel, left, right } as RelacionVNext) : rel;
    }
    case "union_all":
      if (rel.inputs.includes(fromId)) {
        return {
          ...rel,
          inputs: rel.inputs.map((id) => (id === fromId ? toId : id)),
        } as RelacionVNext;
      }
      return rel;
    default:
      return rel;
  }
}

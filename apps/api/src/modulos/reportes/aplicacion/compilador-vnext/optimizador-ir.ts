import type { PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import {
  clasificarPredicadoJoin,
  esProjectFusionable,
  esProjectIdentidad,
} from "./optimizador/capacidades.js";
import {
  esExpresionDeterminista,
  sustituirProyeccionEnExpresion,
} from "./optimizador/expresiones.js";
import {
  crearFiltroDerivado,
  crearIdOptimizacion,
  entradasUnionDistribuibles,
  esquemasUnionCompatibles,
  redirigirMappings,
  redirigirReferencia,
  redirigirTablas,
  referenciaRelacion,
  tieneCamposInternos,
} from "./optimizador/grafo.js";
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
export function optimizarPlanRelacionalVNext(
  plan: PlanCompilacionVNext,
): PlanCompilacionVNext {
  let relations = [...plan.relations];
  let outputId = plan.outputRelationId;
  let tables = { ...plan.tables };
  let mappings = { ...plan.mappings };

  let byId = new Map(relations.map((r) => [r.id, r]));

  let changed = true;
  const seenStates = new Set<string>();
  while (changed) {
    const signature = JSON.stringify({ relations, outputId, tables, mappings });
    if (seenStates.has(signature)) {
      throw new Error(
        "El optimizador relacional entró en un ciclo de reescritura",
      );
    }
    seenStates.add(signature);
    changed = false;

    for (let i = 0; i < relations.length; i++) {
      const rel = relations[i];
      if (rel.op === "filter") {
        const inputRel = byId.get(rel.input);
        if (
          inputRel?.op === "filter" &&
          esExpresionDeterminista(inputRel.condition) &&
          esExpresionDeterminista(rel.condition)
        ) {
          relations[i] = {
            ...rel,
            input: inputRel.input,
            condition: `(${inputRel.condition}) and (${rel.condition})`,
          };
          byId = new Map(
            relations.map((candidate) => [candidate.id, candidate]),
          );
          changed = true;
          break;
        }

        if (inputRel?.op === "project" && esProjectFusionable(inputRel)) {
          const condition = sustituirProyeccionEnExpresion(
            rel.condition,
            inputRel.projections,
          );
          const source = byId.get(inputRel.input);
          if (
            condition &&
            esExpresionDeterminista(condition) &&
            source?.schemaKnown &&
            source.fields.length > 0
          ) {
            const pushedId = crearIdOptimizacion(
              relations,
              `${rel.id}__filter`,
            );
            const pushed = crearFiltroDerivado(
              source,
              pushedId,
              condition,
              rel.span,
            );
            const replacementProject: RelacionVNext = {
              ...inputRel,
              id: rel.id,
              input: pushedId,
              fields: [...rel.fields],
            };
            relations = relations.map((candidate) =>
              candidate.id === rel.id ? replacementProject : candidate,
            );
            relations.push(pushed);
            byId = new Map(
              relations.map((candidate) => [candidate.id, candidate]),
            );
            changed = true;
            break;
          }
        }

        if (inputRel?.op === "join" && inputRel.join === "inner") {
          const left = byId.get(inputRel.left);
          const right = byId.get(inputRel.right);
          if (left && right) {
            const branch = clasificarPredicadoJoin(rel.condition, left, right);
            if (branch === "left" || branch === "right") {
              const source = branch === "left" ? left : right;
              const pushedId = crearIdOptimizacion(
                relations,
                `${rel.id}__filter`,
              );
              const pushed = crearFiltroDerivado(
                source,
                pushedId,
                rel.condition,
                rel.span,
              );
              const replacementJoin: RelacionVNext = {
                ...inputRel,
                id: rel.id,
                fields: [...rel.fields],
                ...(branch === "left"
                  ? { left: pushedId }
                  : { right: pushedId }),
              };
              relations = relations.map((candidate) =>
                candidate.id === rel.id ? replacementJoin : candidate,
              );
              relations.push(pushed);
              byId = new Map(
                relations.map((candidate) => [candidate.id, candidate]),
              );
              changed = true;
              break;
            }
          }
        }

        if (
          inputRel?.op === "union_all" &&
          esExpresionDeterminista(rel.condition)
        ) {
          const branches = entradasUnionDistribuibles(inputRel, byId);
          if (branches) {
            const pushedFilters = branches.map((source, index) =>
              crearFiltroDerivado(
                source,
                crearIdOptimizacion(
                  relations,
                  `${rel.id}__branch_${index + 1}_filter`,
                ),
                rel.condition,
                rel.span,
              ),
            );
            const replacementUnion: RelacionVNext = {
              ...inputRel,
              id: rel.id,
              inputs: pushedFilters.map((filter) => filter.id),
              fields: [...rel.fields],
              schemaKnown: rel.schemaKnown,
              fieldMetadata: rel.fieldMetadata,
              span: rel.span,
            };
            relations = relations.map((candidate) =>
              candidate.id === rel.id ? replacementUnion : candidate,
            );
            relations.push(...pushedFilters);
            byId = new Map(
              relations.map((candidate) => [candidate.id, candidate]),
            );
            changed = true;
            break;
          }
        }
      }

      if (rel.op === "sort") {
        const consumers = relations.filter((candidate) =>
          referenciaRelacion(candidate, rel.id),
        );
        const consumer = consumers.length === 1 ? consumers[0] : undefined;
        const anchored =
          outputId === rel.id ||
          Object.values(tables).includes(rel.id) ||
          Object.values(mappings).some(
            (mapping) => mapping.relationId === rel.id,
          );
        if (consumer?.op === "aggregate" && !anchored) {
          relations = relations
            .filter((candidate) => candidate.id !== rel.id)
            .map((candidate) =>
              redirigirReferencia(candidate, rel.id, rel.input),
            );
          byId = new Map(
            relations.map((candidate) => [candidate.id, candidate]),
          );
          changed = true;
          break;
        }
      }

      if (rel.op === "union_all") {
        const flattened: string[] = [];
        let canFlatten = false;
        for (const inputId of rel.inputs) {
          const input = byId.get(inputId);
          if (
            input?.op === "union_all" &&
            esquemasUnionCompatibles(rel, input)
          ) {
            flattened.push(...input.inputs);
            canFlatten = true;
          } else {
            flattened.push(inputId);
          }
        }
        if (canFlatten) {
          relations[i] = { ...rel, inputs: flattened };
          byId = new Map(
            relations.map((candidate) => [candidate.id, candidate]),
          );
          changed = true;
          break;
        }
      }

      if (rel.op === "project") {
        const inputRel = byId.get(rel.input);
        if (!inputRel) continue;

        const isIdentity = esProjectIdentidad(rel, inputRel);

        // Si es identidad y su entrada ya es un project o filter sobre project
        if (isIdentity) {
          const targetId = rel.input;
          relations = relations
            .filter((r) => r.id !== rel.id)
            .map((r) => redirigirReferencia(r, rel.id, targetId));

          if (outputId === rel.id) {
            outputId = targetId;
          }
          tables = redirigirTablas(tables, rel.id, targetId);
          mappings = redirigirMappings(mappings, rel.id, targetId);

          byId = new Map(relations.map((r) => [r.id, r]));
          changed = true;
          break;
        }

        if (inputRel.op === "union_all" && esProjectFusionable(rel)) {
          const branches = entradasUnionDistribuibles(inputRel, byId);
          if (branches) {
            const branchProjects = branches.map((source, index) => ({
              ...rel,
              id: crearIdOptimizacion(
                relations,
                `${rel.id}__branch_${index + 1}_project`,
              ),
              input: source.id,
            }));
            const replacementUnion: RelacionVNext = {
              ...inputRel,
              id: rel.id,
              inputs: branchProjects.map((project) => project.id),
              fields: [...rel.fields],
              schemaKnown: rel.schemaKnown,
              fieldMetadata: rel.fieldMetadata,
              span: rel.span,
            };
            relations = relations.map((candidate) =>
              candidate.id === rel.id ? replacementUnion : candidate,
            );
            relations.push(...branchProjects);
            byId = new Map(
              relations.map((candidate) => [candidate.id, candidate]),
            );
            changed = true;
            break;
          }
        }

        if (
          inputRel.op === "project" &&
          esProjectFusionable(rel) &&
          esProjectFusionable(inputRel)
        ) {
          const projections = rel.projections.map((projection) => {
            const expression = sustituirProyeccionEnExpresion(
              projection.expression,
              inputRel.projections,
            );
            return expression ? { ...projection, expression } : undefined;
          });
          if (
            projections.every(
              (projection): projection is CampoLoadVNext => !!projection,
            )
          ) {
            relations[i] = {
              ...rel,
              input: inputRel.input,
              projections,
            };
            byId = new Map(
              relations.map((candidate) => [candidate.id, candidate]),
            );
            changed = true;
            break;
          }
        }

        // Colapsa un project escalar consumido por un aggregate. Sustituye los
        // aliases calculados (p. ej. Año_year) por su expresión original y
        // conecta el aggregate directamente a la entrada del project.
        if (esProjectFusionable(rel)) {
          const consumers = relations.filter((candidate) =>
            referenciaRelacion(candidate, rel.id),
          );
          const consumer = consumers.length === 1 ? consumers[0] : undefined;
          const anchored =
            outputId === rel.id ||
            Object.values(tables).includes(rel.id) ||
            Object.values(mappings).some(
              (mapping) => mapping.relationId === rel.id,
            );
          if (consumer?.op === "aggregate" && !anchored) {
            const projections = consumer.projections.map((projection) => {
              const expression = sustituirProyeccionEnExpresion(
                projection.expression,
                rel.projections,
              );
              return expression ? { ...projection, expression } : undefined;
            });
            const groupBy = consumer.groupBy.map((expression) =>
              sustituirProyeccionEnExpresion(expression, rel.projections),
            );
            if (
              projections.every(
                (projection): projection is CampoLoadVNext => !!projection,
              ) &&
              groupBy.every((expression): expression is string => !!expression)
            ) {
              const updatedAggregate: RelacionVNext = {
                ...consumer,
                input: rel.input,
                projections,
                groupBy,
              };
              relations = relations
                .filter((candidate) => candidate.id !== rel.id)
                .map((candidate) =>
                  candidate.id === consumer.id ? updatedAggregate : candidate,
                );
              byId = new Map(
                relations.map((candidate) => [candidate.id, candidate]),
              );
              changed = true;
              break;
            }
          }
        }

        // Colapso de project de salida sobre aggregate:
        // Si `rel` es la salida final, no tiene distinct, ni mappingLookups,
        // y su entrada `inputRel` es un `aggregate`.
        const inputConsumers = relations.filter((candidate) =>
          referenciaRelacion(candidate, inputRel.id),
        );
        const inputAggregateAnchored =
          Object.values(tables).includes(inputRel.id) ||
          Object.values(mappings).some(
            (mapping) => mapping.relationId === inputRel.id,
          );
        if (
          rel.id === outputId &&
          esProjectFusionable(rel) &&
          inputRel.op === "aggregate" &&
          inputConsumers.length === 1 &&
          inputConsumers[0]?.id === rel.id &&
          !inputAggregateAnchored
        ) {
          const inputProjectionsMap = new Map<string, CampoLoadVNext>();
          for (const p of inputRel.projections) {
            inputProjectionsMap.set(p.alias, p);
          }

          // Verificar si todas las proyecciones del project son constantes o referencias directas a campos del aggregate
          let canInline = true;
          const inlinedProjections: CampoLoadVNext[] = [];

          for (const p of rel.projections) {
            const rawExpr = descorchetar(p.expression);
            if (inputProjectionsMap.has(rawExpr)) {
              // Referencia a un campo agregado existente
              const orig = inputProjectionsMap.get(rawExpr);
              if (!orig) {
                canInline = false;
                break;
              }
              inlinedProjections.push({
                ...orig,
                alias: p.alias,
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
            tables = redirigirTablas(tables, rel.id, inputRel.id);
            mappings = redirigirMappings(mappings, rel.id, inputRel.id);
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
    tables,
    mappings,
    outputRelationId: outputId,
  };
}

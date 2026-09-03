import type { RelacionVNext } from "../ir.js";
import {
  esExpresionDeterminista,
  referenciasExpresion,
} from "./expresiones.js";

export type RamaPredicadoJoin = "left" | "right" | "cross" | "ambiguous";

export function clasificarPredicadoJoin(
  condition: string,
  left: RelacionVNext,
  right: RelacionVNext,
): RamaPredicadoJoin {
  if (!esExpresionDeterminista(condition)) return "ambiguous";
  let references: Set<string>;
  try {
    references = referenciasExpresion(condition);
  } catch {
    return "ambiguous";
  }
  if (references.size === 0) return "ambiguous";

  let usesLeft = false;
  let usesRight = false;
  for (const reference of references) {
    const inLeft = left.fields.includes(reference);
    const inRight = right.fields.includes(reference);
    if ((inLeft && inRight) || (!inLeft && !inRight)) return "ambiguous";
    usesLeft ||= inLeft;
    usesRight ||= inRight;
  }
  if (usesLeft && usesRight) return "cross";
  return usesLeft ? "left" : "right";
}

export function esProjectFusionable(
  relation: Extract<RelacionVNext, { op: "project" }>,
): boolean {
  return (
    !relation.distinct &&
    (!relation.mappingLookups || relation.mappingLookups.length === 0) &&
    (!relation.mapSubstringLookups ||
      relation.mapSubstringLookups.length === 0) &&
    (!relation.dualExpressions ||
      Object.keys(relation.dualExpressions).length === 0) &&
    (!relation.orderBy || relation.orderBy.length === 0) &&
    relation.projections.every(
      (projection) =>
        projection.expression !== "*" &&
        esExpresionDeterminista(projection.expression),
    )
  );
}

export function esProjectIdentidad(
  relation: Extract<RelacionVNext, { op: "project" }>,
  input: RelacionVNext,
): boolean {
  return (
    esProjectFusionable(relation) &&
    relation.projections.every(
      (projection) =>
        descorchetar(projection.expression) === projection.alias &&
        input.fields.includes(projection.alias),
    ) &&
    relation.fields.length === input.fields.length &&
    relation.fields.every((field, index) => field === input.fields[index])
  );
}

function descorchetar(nombre: string): string {
  if (nombre.startsWith("[") && nombre.endsWith("]"))
    return nombre.slice(1, -1);
  return nombre.replace(/^`|`$/g, "");
}

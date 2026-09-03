import type { PlanCompilacionVNext, RelacionVNext } from "../ir.js";

export function entradasUnionDistribuibles(
  relation: Extract<RelacionVNext, { op: "union_all" }>,
  byId: ReadonlyMap<string, RelacionVNext>,
): RelacionVNext[] | undefined {
  if (tieneCamposInternos(relation)) return undefined;
  const inputs = relation.inputs.map((id) => byId.get(id));
  if (inputs.some((input) => !input)) return undefined;
  const branches = inputs as RelacionVNext[];
  if (
    branches.some(
      (input) =>
        tieneCamposInternos(input) ||
        input.fields.length !== relation.fields.length ||
        input.fields.some((field, index) => field !== relation.fields[index]),
    )
  ) {
    return undefined;
  }
  return branches;
}

export function esquemasUnionCompatibles(
  parent: Extract<RelacionVNext, { op: "union_all" }>,
  child: Extract<RelacionVNext, { op: "union_all" }>,
): boolean {
  return (
    !tieneCamposInternos(parent) &&
    !tieneCamposInternos(child) &&
    parent.fields.length === child.fields.length &&
    parent.fields.every((field, index) => field === child.fields[index])
  );
}

export function tieneCamposInternos(relation: RelacionVNext): boolean {
  return (
    (relation.internalFields?.length ?? 0) > 0 ||
    Object.keys(relation.dualComponents ?? {}).length > 0 ||
    ("dualExpressions" in relation &&
      Object.keys(relation.dualExpressions ?? {}).length > 0)
  );
}

export function referenciaRelacion(
  relation: RelacionVNext,
  targetId: string,
): boolean {
  switch (relation.op) {
    case "join":
      return relation.left === targetId || relation.right === targetId;
    case "union_all":
      return relation.inputs.includes(targetId);
    case "semi_filter":
      return relation.input === targetId || relation.against === targetId;
    case "project":
      return (
        relation.input === targetId ||
        (relation.mappingLookups ?? []).some(
          (lookup) => lookup.relationId === targetId,
        ) ||
        (relation.mapSubstringLookups ?? []).some(
          (lookup) => lookup.relationId === targetId,
        )
      );
    case "stateful":
      return (
        relation.input === targetId ||
        relation.stateful.exists?.against === targetId
      );
    case "filter":
    case "aggregate":
    case "sort":
    case "limit":
    case "unpivot":
    case "generic":
      return relation.input === targetId;
    case "inline":
    case "autogenerate":
    case "native_sql":
      return false;
  }
}

export function crearIdOptimizacion(
  relations: readonly RelacionVNext[],
  base: string,
): string {
  const ids = new Set(relations.map((relation) => relation.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function crearFiltroDerivado(
  input: RelacionVNext,
  id: string,
  condition: string,
  span: RelacionVNext["span"],
): Extract<RelacionVNext, { op: "filter" }> {
  return {
    id,
    op: "filter",
    input: input.id,
    condition,
    fields: [...input.fields],
    schemaKnown: input.schemaKnown,
    span,
    ...(input.fieldMetadata ? { fieldMetadata: input.fieldMetadata } : {}),
    ...(input.sourceRefs ? { sourceRefs: input.sourceRefs } : {}),
    ...(input.dualFields ? { dualFields: [...input.dualFields] } : {}),
    ...(input.dualComponents ? { dualComponents: input.dualComponents } : {}),
    ...(input.internalFields
      ? { internalFields: [...input.internalFields] }
      : {}),
    ...(input.orderBy ? { orderBy: [...input.orderBy] } : {}),
  };
}

export function redirigirTablas(
  tables: PlanCompilacionVNext["tables"],
  fromId: string,
  toId: string,
): PlanCompilacionVNext["tables"] {
  return Object.fromEntries(
    Object.entries(tables).map(([name, id]) => [
      name,
      id === fromId ? toId : id,
    ]),
  );
}

export function redirigirMappings(
  mappings: PlanCompilacionVNext["mappings"],
  fromId: string,
  toId: string,
): PlanCompilacionVNext["mappings"] {
  return Object.fromEntries(
    Object.entries(mappings).map(([name, mapping]) => [
      name,
      mapping.relationId === fromId
        ? { ...mapping, relationId: toId }
        : mapping,
    ]),
  );
}

export function redirigirReferencia(
  rel: RelacionVNext,
  fromId: string,
  toId: string,
): RelacionVNext {
  switch (rel.op) {
    case "project": {
      const input = rel.input === fromId ? toId : rel.input;
      const mappingLookups = rel.mappingLookups?.map((lookup) =>
        lookup.relationId === fromId ? { ...lookup, relationId: toId } : lookup,
      );
      const mapSubstringLookups = rel.mapSubstringLookups?.map((lookup) =>
        lookup.relationId === fromId ? { ...lookup, relationId: toId } : lookup,
      );
      return {
        ...rel,
        input,
        ...(mappingLookups ? { mappingLookups } : {}),
        ...(mapSubstringLookups ? { mapSubstringLookups } : {}),
      };
    }
    case "semi_filter":
      return {
        ...rel,
        input: rel.input === fromId ? toId : rel.input,
        against: rel.against === fromId ? toId : rel.against,
      };
    case "stateful": {
      const exists = rel.stateful.exists;
      return {
        ...rel,
        input: rel.input === fromId ? toId : rel.input,
        stateful:
          exists?.against === fromId
            ? { ...rel.stateful, exists: { ...exists, against: toId } }
            : rel.stateful,
      };
    }
    case "filter":
    case "aggregate":
    case "sort":
    case "limit":
    case "unpivot":
    case "generic":
      return rel.input === fromId ? { ...rel, input: toId } : rel;
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

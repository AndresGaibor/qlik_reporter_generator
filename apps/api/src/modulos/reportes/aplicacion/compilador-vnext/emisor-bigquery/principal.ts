import type { EntornoExpresionQlik } from "../expresiones-qlik.js";
import type { OpcionesCompilacionVNext } from "../index.js";
import type { PlanCompilacionVNext, RelacionVNext } from "../ir.js";
import {
  construirMapSubstringBindings,
  entornoAgregacion,
  entornoProyeccion,
  extraerEntornoExpresion,
  metadataDeEntrada,
} from "./entornos.js";
import {
  emitirAutogenerate,
  emitirFuenteParaProyeccion,
  emitirInline,
} from "./fuentes.js";
import { emitirRelacionInterRegistro } from "./inter-registro.js";
import {
  emitFields,
  emitirJoin,
  emitirSemiFilter,
  emitirUnion,
  mismaExpresionQlik,
} from "./relacional.js";
import type { EmisionBigQueryVNext } from "./tipos.js";
import { fail, indent, qlik, quote, wrap } from "./utilidades.js";

export function emitirBigQueryVNext(
  plan: PlanCompilacionVNext,
  options: OpcionesCompilacionVNext = {},
): EmisionBigQueryVNext {
  const environment = extraerEntornoExpresion(plan, options.fieldTypes);
  const byId = new Map(
    plan.relations.map((relation) => [relation.id, relation]),
  );
  const output = plan.outputRelationId
    ? byId.get(plan.outputRelationId)
    : undefined;
  if (!output)
    fail(
      "BIGQUERY_NO_OUTPUT_RELATION",
      "El programa no produjo una relación de salida exportable",
    );

  const sharedRelationIds = relacionesCompartidasFactorizables(output.id, byId);
  const cteNames = new Map(
    sharedRelationIds.map((id) => [id, `shared_${normalizarIdCte(id)}`]),
  );
  const cache = new Map<string, string>();

  const emitInline = (id: string, includeInternal = false): string => {
    const cacheKey = `${id}:${includeInternal ? "internal" : "visible"}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const relation = byId.get(id);
    if (!relation)
      fail("BIGQUERY_RELATION_NOT_FOUND", `No existe la relación ${id}`);
    const sql = emitirRelacion(
      relation,
      byId,
      emit,
      environment,
      includeInternal,
    );
    cache.set(cacheKey, sql);
    return sql;
  };

  const emit = (id: string, includeInternal = false): string => {
    const cteName = cteNames.get(id);
    if (cteName) return `SELECT *\nFROM ${cteName}`;
    return emitInline(id, includeInternal);
  };

  const body = emit(output.id, false).trim().replace(/;\s*$/, "");
  const ctes = ordenarCtes(sharedRelationIds, byId).map((id) => {
    const name = cteNames.get(id);
    if (!name) fail("BIGQUERY_CTE_NAME_MISSING", `No existe CTE para ${id}`);
    return `${name} AS (\n${indent(emitInline(id, false), 2)}\n)`;
  });

  return {
    sql: ctes.length > 0 ? `WITH ${ctes.join(",\n")}\n${body}` : body,
    strategy:
      output.op === "native_sql" ? "source_sql_passthrough" : "single_query",
  };
}

function dependenciasRelacion(relation: RelacionVNext): string[] {
  switch (relation.op) {
    case "join":
      return [relation.left, relation.right];
    case "union_all":
      return relation.inputs;
    case "semi_filter":
      return [relation.input, relation.against];
    case "filter":
    case "project":
    case "aggregate":
    case "sort":
    case "limit":
    case "unpivot":
    case "generic":
    case "stateful":
      return [relation.input];
    case "inline":
    case "autogenerate":
    case "native_sql":
      return [];
  }
}

function tieneCamposInternos(relation: RelacionVNext): boolean {
  return (
    (relation.internalFields?.length ?? 0) > 0 ||
    Object.keys(relation.dualComponents ?? {}).length > 0 ||
    ("dualExpressions" in relation &&
      Object.keys(relation.dualExpressions ?? {}).length > 0)
  );
}

function esRelacionFactorizable(relation: RelacionVNext): boolean {
  if (tieneCamposInternos(relation)) return false;
  return !["inline", "autogenerate", "native_sql", "join", "generic"].includes(
    relation.op,
  );
}

function relacionesCompartidasFactorizables(
  outputId: string,
  byId: Map<string, RelacionVNext>,
): string[] {
  const references = new Map<string, number>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const relation = byId.get(id);
    if (!relation) return;
    for (const dependency of dependenciasRelacion(relation)) {
      references.set(dependency, (references.get(dependency) ?? 0) + 1);
      visit(dependency);
    }
  };

  visit(outputId);
  return [...references.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .filter((id) => {
      const relation = byId.get(id);
      return relation ? esRelacionFactorizable(relation) : false;
    });
}

function ordenarCtes(
  ids: readonly string[],
  byId: Map<string, RelacionVNext>,
): string[] {
  const candidates = new Set(ids);
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const relation = byId.get(id);
    if (!relation) return;
    for (const dependency of dependenciasRelacion(relation)) {
      if (candidates.has(dependency)) visit(dependency);
    }
    ordered.push(id);
  };

  for (const id of ids) visit(id);
  return ordered;
}

function normalizarIdCte(id: string): string {
  const normalized = id.replace(/[^A-Za-z0-9_]/g, "_");
  return normalized || "relation";
}

export function emitirRelacion(
  relation: RelacionVNext,
  byId: Map<string, RelacionVNext>,
  emit: (id: string, includeInternal?: boolean) => string,
  environment: EntornoExpresionQlik,
  includeInternal: boolean,
): string {
  switch (relation.op) {
    case "inline":
      return emitirInline(relation);
    case "autogenerate":
      return emitirAutogenerate(relation, environment);
    case "native_sql":
      return relation.sql.trim().replace(/;\s*$/, "");
    case "filter": {
      const input = byId.get(relation.input);
      const filterEnvironment = {
        ...environment,
        ...metadataDeEntrada(input, environment),
      };
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nWHERE ${qlik(relation.condition, "condition", filterEnvironment)}`;
    }
    case "project": {
      const input = byId.get(relation.input);
      const absorbed = input?.op === "filter" ? input : undefined;
      const sourceId = absorbed?.input ?? relation.input;
      const projectEnvironment = entornoProyeccion(
        relation,
        input,
        environment,
        construirMapSubstringBindings(relation, byId, emit),
      );
      const where = absorbed
        ? `\nWHERE ${qlik(absorbed.condition, "condition", projectEnvironment)}`
        : "";
      const from = emitirFuenteParaProyeccion(
        sourceId,
        relation,
        byId,
        emit,
        environment,
      );
      return `SELECT${relation.distinct ? " DISTINCT" : ""}\n  ${emitFields(
        relation.projections,
        projectEnvironment,
        relation,
        includeInternal,
      )}\nFROM ${from}${where}`;
    }
    case "aggregate": {
      const input = byId.get(relation.input);
      const absorbed = input?.op === "filter" ? input : undefined;
      const sourceId = absorbed?.input ?? relation.input;
      const aggregateEnvironment = entornoAgregacion(
        relation,
        input,
        environment,
      );
      const where = absorbed
        ? `\nWHERE ${qlik(absorbed.condition, "condition", aggregateEnvironment)}`
        : "";
      const groupExpressions = relation.groupBy.map((expression) =>
        qlik(expression, "value", aggregateEnvironment),
      );
      if (includeInternal && relation.dualExpressions) {
        for (const expression of Object.values(relation.dualExpressions)) {
          if (
            !relation.groupBy.some((groupBy) =>
              mismaExpresionQlik(groupBy, expression),
            )
          )
            continue;
          groupExpressions.push(
            qlik(expression, "numeric_component", aggregateEnvironment),
            qlik(expression, "text", aggregateEnvironment),
          );
        }
      }
      const from = emitirFuenteParaProyeccion(
        sourceId,
        relation,
        byId,
        emit,
        environment,
      );
      // BigQuery GROUP BY ALL automatically groups by every non-aggregate
      // expression in the SELECT list — semantically equivalent to Qlik's
      // explicit GROUP BY, and far cleaner than enumerating all dimensions.
      // We keep the explicit list only when emitting intermediate CTEs that
      // carry dual numeric/text components, because those synthetic columns
      // must be referenced by name from downstream consumers.
      const needsExplicitGroupBy =
        includeInternal &&
        !!relation.dualExpressions &&
        Object.keys(relation.dualExpressions).length > 0;
      const group = needsExplicitGroupBy
        ? [...new Set(groupExpressions)].join(", ")
        : "ALL";
      return `SELECT\n  ${emitFields(
        relation.projections,
        aggregateEnvironment,
        relation,
        includeInternal,
      )}\nFROM ${from}${where}\nGROUP BY ${group}`;
    }
    case "sort": {
      const input = byId.get(relation.input);
      const sortEnvironment = {
        ...environment,
        ...metadataDeEntrada(input, environment),
      };
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nORDER BY ${relation.orderBy
        .map(
          (item) =>
            `${qlik(item.expression, "value", sortEnvironment)} ${item.direction.toUpperCase()}`,
        )
        .join(", ")}`;
    }
    case "limit": {
      const limit = relation.limitExpression.trim();
      if (!/^\d+$/.test(limit)) {
        fail(
          "BIGQUERY_DYNAMIC_FIRST_UNSUPPORTED",
          `FIRST requiere un entero compile-time en esta fase: ${limit}`,
        );
      }
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nLIMIT ${limit}`;
    }
    case "join":
      return emitirJoin(relation, byId, emit);
    case "union_all":
      return emitirUnion(relation, byId, emit);
    case "semi_filter":
      return emitirSemiFilter(relation, emit);
    case "unpivot":
      return `SELECT *\nFROM ${wrap(emit(relation.input, true), "src")}\nUNPIVOT${
        relation.includeNulls ? " INCLUDE NULLS" : ""
      } (${quote(relation.dataField)} FOR ${quote(relation.attributeField)} IN (${relation.valueFields
        .map(quote)
        .join(", ")}))`;
    case "generic":
      return fail(
        "BIGQUERY_GENERIC_MULTI_RELATION",
        "Generic LOAD crea una tabla lógica por atributo y no puede exportarse como una sola relación sin una selección explícita",
      );
    case "stateful":
      return emitirRelacionInterRegistro(relation, byId, emit, environment);
  }
}

import type {
  BindingApplyMapQlik,
  EntornoExpresionQlik,
} from "../expresiones-qlik.js";
import type { PlanCompilacionVNext, RelacionVNext } from "../ir.js";
import type { BindingMapSubstringQlik } from "../mapping-mapsubstring.js";
import { construirCatalogoMetadata } from "../metadata.js";
import { toBinding } from "./fuentes.js";
import { fail, numberSetting, qlik, qlikLiteral } from "./utilidades.js";

function metadataDeEntrada(
  input: RelacionVNext | undefined,
  base: EntornoExpresionQlik,
): Pick<EntornoExpresionQlik, "fieldMetadata" | "fieldTypes"> {
  if (!input?.fieldMetadata)
    return base.fieldTypes ? { fieldTypes: base.fieldTypes } : {};
  const relationTypes = Object.fromEntries(
    Object.entries(input.fieldMetadata).map(([field, metadata]) => [
      field,
      metadata.type,
    ]),
  );
  return {
    fieldMetadata: input.fieldMetadata,
    fieldTypes: { ...(base.fieldTypes ?? {}), ...relationTypes },
  };
}

export function entornoFuente(
  base: EntornoExpresionQlik,
  bindings: ReadonlyMap<string, BindingApplyMapQlik> = new Map(),
): EntornoExpresionQlik {
  return {
    ...base,
    identifierQualifier: "src",
    applyMapBindings: bindings,
  };
}

export function entornoProyeccion(
  relation: Extract<RelacionVNext, { op: "project" }>,
  input: RelacionVNext | undefined,
  base: EntornoExpresionQlik,
  mapSubstringBindings: ReadonlyMap<
    string,
    BindingMapSubstringQlik
  > = new Map(),
): EntornoExpresionQlik {
  const lookups = relation.mappingLookups ?? [];
  const bindings = new Map(
    lookups.map((lookup) => [lookup.callKey, toBinding(lookup)]),
  );
  const needsQualifier =
    lookups.length > 0 ||
    (relation.mapSubstringLookups?.length ?? 0) > 0 ||
    Object.keys(input?.dualComponents ?? {}).length > 0;
  return {
    ...base,
    ...metadataDeEntrada(input, base),
    ...(needsQualifier ? { identifierQualifier: "src" } : {}),
    ...(input?.dualComponents ? { dualComponents: input.dualComponents } : {}),
    applyMapBindings: bindings,
    mapSubstringBindings,
  };
}

export function construirMapSubstringBindings(
  relation: Extract<RelacionVNext, { op: "project" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string, includeInternal?: boolean) => string,
): ReadonlyMap<string, BindingMapSubstringQlik> {
  const bindings = new Map<string, BindingMapSubstringQlik>();
  for (const lookup of relation.mapSubstringLookups ?? []) {
    if (!byId.has(lookup.relationId))
      fail(
        "BIGQUERY_MAPPING_RELATION_MISSING",
        `No existe la relación del mapping ${lookup.mappingName}`,
      );
    bindings.set(lookup.callKey, {
      callKey: lookup.callKey,
      alias: lookup.alias,
      keyField: lookup.keyField,
      valueField: lookup.valueField,
      sourceSql: emit(lookup.relationId, true),
    });
  }
  return bindings;
}

export function entornoAgregacion(
  relation: Extract<RelacionVNext, { op: "aggregate" }>,
  input: RelacionVNext | undefined,
  base: EntornoExpresionQlik,
): EntornoExpresionQlik {
  const order = (relation.orderBy ?? relation.aggregationOrderBy)?.map(
    (item) =>
      `${qlik(item.expression, "value", base)} ${item.direction.toUpperCase()}`,
  );
  return {
    ...base,
    ...metadataDeEntrada(input, base),
    ...(input?.dualComponents ? { dualComponents: input.dualComponents } : {}),
    ...(order && order.length > 0 ? { aggregationOrderBy: order } : {}),
  };
}

export function extraerEntornoExpresion(
  plan: PlanCompilacionVNext,
  fieldTypes?: Readonly<Record<string, string>>,
): EntornoExpresionQlik {
  const environment: EntornoExpresionQlik = {
    tableMetadata: construirCatalogoMetadata(plan),
    ...(fieldTypes ? { fieldTypes } : {}),
  };
  for (const effect of plan.effects) {
    if (effect.kind !== "define_variable") continue;
    const match = effect.body.match(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/s,
    );
    if (!match?.[1] || match[2] === undefined) continue;
    const value = qlikLiteral(match[2]);
    if (value === undefined) continue;
    switch (match[1].toLowerCase()) {
      case "dateformat":
        environment.dateFormat = value;
        break;
      case "timeformat":
        environment.timeFormat = value;
        break;
      case "timestampformat":
        environment.timestampFormat = value;
        break;
      case "monthnames":
        environment.monthNames = value.split(";");
        break;
      case "daynames":
        environment.dayNames = value.split(";");
        break;
      case "decimalsep":
        environment.decimalSep = value;
        break;
      case "thousandsep":
        environment.thousandSep = value;
        break;
      case "firstweekday":
        environment.firstWeekDay = numberSetting(value);
        break;
      case "brokenweeks":
        environment.brokenWeeks = numberSetting(value);
        break;
      case "referenceday":
        environment.referenceDay = numberSetting(value);
        break;
      case "firstmonthofyear":
        environment.firstMonthOfYear = numberSetting(value);
        break;
    }
  }
  return environment;
}

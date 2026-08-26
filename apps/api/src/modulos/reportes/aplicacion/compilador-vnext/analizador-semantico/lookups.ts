import type { ExprQlik } from "../expresiones-qlik.js";
import {
  parsearExpresionQlik,
  serializarExpresionQlik,
} from "../expresiones-qlik.js";
import type {
  LookupApplyMapVNext,
  LookupMapSubstringVNext,
  MappingTableVNext,
  RelacionVNext,
} from "../ir.js";
import { nombreCampoDual, nombreCampoHit } from "../mapping-applymap.js";
import type { SourceSpan } from "../modelo.js";
import type { EspecificacionLoadVNext } from "../parser-carga.js";
import type { VariablesQlik } from "../variables-qlik.js";
import {
  VariableQlikRuntimeError,
  expandirVariablesQlik,
} from "../variables-qlik.js";
import { fail } from "./errores.js";

export function expandir(
  text: string,
  variables: VariablesQlik,
  span: SourceSpan,
): string {
  try {
    return expandirVariablesQlik(text, variables);
  } catch (error) {
    if (error instanceof VariableQlikRuntimeError)
      fail(
        "VARIABLE_LET_RUNTIME_REQUIRED",
        "UNSUPPORTED_SEMANTICS",
        error.message,
        span,
      );
    throw error;
  }
}

export function resolverLookups(
  fields: EspecificacionLoadVNext["fields"],
  mappings: Record<string, MappingTableVNext>,
  span: SourceSpan,
): LookupApplyMapVNext[] {
  const result: LookupApplyMapVNext[] = [];
  const byCallKey = new Map<string, LookupApplyMapVNext>();
  for (const field of fields) {
    if (field.expression === "*") continue;
    const expression = parsearExpresionQlik(field.expression);
    for (const call of encontrarApplyMaps(expression)) {
      if (call.args.length < 2 || call.args.length > 3)
        fail(
          "APPLYMAP_ARITY",
          "TYPE_SEMANTICS",
          "ApplyMap requiere dos o tres argumentos",
          span,
        );
      const mappingArgument = call.args[0];
      if (mappingArgument?.kind !== "string")
        fail(
          "APPLYMAP_MAPPING_NAME_LITERAL_REQUIRED",
          "NAME_RESOLUTION",
          "APPLYMAP_MAPPING_NAME_LITERAL_REQUIRED: ApplyMap requiere el nombre literal de una tabla MAPPING",
          span,
        );
      const mappingName = mappingArgument.value;
      const mapping = mappings[mappingName];
      if (!mapping)
        fail(
          "APPLYMAP_MAPPING_NOT_FOUND",
          "NAME_RESOLUTION",
          `ApplyMap referencia una tabla MAPPING no cargada: ${mappingName}`,
          span,
        );
      const keyExpression = call.args[1];
      if (!keyExpression)
        fail(
          "APPLYMAP_ARITY",
          "TYPE_SEMANTICS",
          "ApplyMap requiere una expresión de clave",
          span,
        );
      const callKey = serializarExpresionQlik(call);
      if (byCallKey.has(callKey)) continue;
      const lookup: LookupApplyMapVNext = {
        callKey,
        mappingName,
        relationId: mapping.relationId,
        keyField: mapping.keyField,
        valueField: mapping.valueField,
        keyExpression,
        ...(call.args[2] ? { defaultExpression: call.args[2] } : {}),
        alias: result.length === 0 ? "map" : `map_${result.length + 1}`,
        hitField: nombreCampoHit(mappingName, mapping.valueField),
        lookupValueField: mapping.valueField,
        lookupNumericField:
          mapping.valueDual?.numericField ??
          nombreCampoDual(mapping.valueField, "numeric"),
        lookupTextField:
          mapping.valueDual?.textField ??
          nombreCampoDual(mapping.valueField, "text"),
        valueIsDual: mapping.valueIsDual,
      };
      result.push(lookup);
      byCallKey.set(callKey, lookup);
    }
  }
  return result;
}

export function encontrarApplyMaps(
  expression: ExprQlik,
): Extract<ExprQlik, { kind: "call" }>[] {
  const result: Extract<ExprQlik, { kind: "call" }>[] = [];
  const visit = (node: ExprQlik) => {
    if (node.kind === "call") {
      if (node.name.toLowerCase() === "applymap") result.push(node);
      for (const argument of node.args) visit(argument);
      return;
    }
    if (node.kind === "unary") {
      visit(node.operand);
      return;
    }
    if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(expression);
  return result;
}

export function resolverMapSubstringLookups(
  fields: EspecificacionLoadVNext["fields"],
  mappings: Record<string, MappingTableVNext>,
  relations: readonly RelacionVNext[],
  span: SourceSpan,
): LookupMapSubstringVNext[] {
  const result: LookupMapSubstringVNext[] = [];
  const byCallKey = new Set<string>();
  for (const field of fields) {
    if (field.expression === "*") continue;
    const expression = parsearExpresionQlik(field.expression);
    for (const call of encontrarMapSubstring(expression)) {
      if (call.args.length !== 2)
        fail(
          "MAPSUBSTRING_ARITY",
          "TYPE_SEMANTICS",
          "MapSubstring requiere dos argumentos",
          span,
        );
      const mappingArgument = call.args[0];
      if (mappingArgument?.kind !== "string")
        fail(
          "MAPSUBSTRING_MAPPING_NAME_LITERAL_REQUIRED",
          "NAME_RESOLUTION",
          "MapSubstring requiere el nombre literal de una tabla MAPPING",
          span,
        );
      const mappingName = mappingArgument.value;
      const mapping = mappings[mappingName];
      if (!mapping)
        fail(
          "MAPSUBSTRING_MAPPING_NOT_FOUND",
          "NAME_RESOLUTION",
          `MapSubstring referencia una tabla MAPPING no cargada: ${mappingName}`,
          span,
        );
      const sourceExpression = call.args[1];
      if (!sourceExpression)
        fail(
          "MAPSUBSTRING_ARITY",
          "TYPE_SEMANTICS",
          "MapSubstring requiere una expresión de entrada",
          span,
        );
      const relation = relations.find(
        (candidate) => candidate.id === mapping.relationId,
      );
      if (!relation || relation.op !== "inline")
        fail(
          "MAPSUBSTRING_MAPPING_ORDER_UNPROVEN",
          "NON_DETERMINISTIC_ORDER",
          `MapSubstring requiere una tabla MAPPING INLINE para probar el orden de sus claves: ${mappingName}`,
          span,
        );
      const keyIndex = relation.columns.indexOf(mapping.keyField);
      const valueIndex = relation.columns.indexOf(mapping.valueField);
      if (
        keyIndex < 0 ||
        valueIndex < 0 ||
        !mappingRowsHaveLiteralKeys(relation, keyIndex, valueIndex)
      )
        fail(
          "MAPSUBSTRING_MAPPING_ORDER_UNPROVEN",
          "NON_DETERMINISTIC_ORDER",
          `MapSubstring requiere claves y valores literales no nulos en el mapping ${mappingName}`,
          span,
        );
      const callKey = serializarExpresionQlik(call);
      if (byCallKey.has(callKey)) continue;
      result.push({
        callKey,
        mappingName,
        relationId: mapping.relationId,
        keyField: mapping.keyField,
        valueField: mapping.valueField,
        sourceExpression,
        alias:
          result.length === 0
            ? "map_substring"
            : `map_substring_${result.length + 1}`,
      });
      byCallKey.add(callKey);
    }
  }
  return result;
}

export function mappingRowsHaveLiteralKeys(
  relation: Extract<RelacionVNext, { op: "inline" }>,
  keyIndex: number,
  valueIndex: number,
): boolean {
  const keys = new Set<string>();
  for (const row of relation.rows) {
    const key = row[keyIndex]?.trim() ?? "";
    const value = row[valueIndex]?.trim() ?? "";
    if (
      !key ||
      !value ||
      /^(?:null|NULL\(\))$/i.test(key) ||
      /^(?:null|NULL\(\))$/i.test(value)
    )
      return false;
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

export function encontrarMapSubstring(
  expression: ExprQlik,
): Extract<ExprQlik, { kind: "call" }>[] {
  const result: Extract<ExprQlik, { kind: "call" }>[] = [];
  const visit = (node: ExprQlik) => {
    if (node.kind === "call") {
      if (node.name.toLowerCase() === "mapsubstring") result.push(node);
      for (const argument of node.args) visit(argument);
      return;
    }
    if (node.kind === "unary") {
      visit(node.operand);
      return;
    }
    if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(expression);
  return result;
}

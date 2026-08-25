import type { ValorConstanteControl } from "../control-flujo.js";
import type { ExprQlik } from "../expresiones-qlik.js";
import {
  esApplyMapDirectoQlik,
  esExpresionDualQlik,
  parsearExpresionQlik,
} from "../expresiones-qlik.js";
import type { ComponentesDualVNext, RelacionVNext } from "../ir.js";
import { nombreCampoDual } from "../mapping-applymap.js";
import type { SourceSpan } from "../modelo.js";
import type { EspecificacionLoadVNext } from "../parser-carga.js";
import { fail } from "./errores.js";
import type { AnalisisProyecciones } from "./tipos.js";

export function analizarProyecciones(
  fields: EspecificacionLoadVNext["fields"],
  source: RelacionVNext,
  materializeAllDuals: boolean,
): AnalisisProyecciones {
  const dualFields: string[] = [];
  const dualComponents: Record<string, ComponentesDualVNext> = {};
  const dualExpressions: Record<string, string> = {};
  const usedInternalNames = new Set<string>();
  const mappingValueAlias = materializeAllDuals ? fields[1]?.alias : undefined;
  for (const field of fields) {
    if (field.expression === "*") continue;
    const parsed = parsearExpresionQlik(field.expression);
    const isDual = esExpresionDualQlik(field.expression);
    const directApplyMap = esApplyMapDirectoQlik(parsed);
    const sourceDual = referenciaDualSimple(parsed, source.dualComponents);
    const materialize =
      isDual ||
      field.alias === mappingValueAlias ||
      directApplyMap ||
      sourceDual;
    if (!materialize) {
      if (isDual) dualFields.push(field.alias);
      continue;
    }
    const components = crearComponentesDual(field.alias, usedInternalNames);
    dualFields.push(field.alias);
    dualComponents[field.alias] = components;
    dualExpressions[field.alias] = field.expression;
  }
  return { dualFields, dualComponents, dualExpressions };
}

export function referenciaDualSimple(
  expression: ExprQlik,
  dualComponents: Record<string, ComponentesDualVNext> | undefined,
): boolean {
  return (
    expression.kind === "identifier" &&
    Boolean(dualComponents?.[expression.name])
  );
}

export function crearComponentesDual(
  field: string,
  used: Set<string>,
): ComponentesDualVNext {
  const numericField = nombreInternoDual(
    nombreCampoDual(field, "numeric"),
    used,
  );
  const textField = nombreInternoDual(nombreCampoDual(field, "text"), used);
  return { numericField, textField };
}

export function nombreInternoDual(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

export function commonFields(
  left: RelacionVNext,
  right: RelacionVNext,
  span: SourceSpan,
  operation: string,
): string[] {
  if (!left.schemaKnown || !right.schemaKnown) {
    fail(
      `${operation}_SCHEMA_UNKNOWN`,
      "TYPE_SEMANTICS",
      `${operation} requiere conocer los campos de ambas tablas`,
      span,
    );
  }
  const keys = left.fields.filter((field) => right.fields.includes(field));
  if (keys.length === 0)
    fail(
      `${operation}_NO_COMMON_FIELDS`,
      "TYPE_SEMANTICS",
      `${operation} Qlik requiere al menos un campo común`,
      span,
    );
  return keys;
}

export function sameFieldSet(
  left: RelacionVNext,
  right: RelacionVNext,
): boolean {
  return (
    left.schemaKnown &&
    right.schemaKnown &&
    left.fields.length === right.fields.length &&
    left.fields.every((field) => right.fields.includes(field))
  );
}

export function valoresControlIguales(
  left: ValorConstanteControl,
  right: ValorConstanteControl,
): boolean {
  return left === right;
}

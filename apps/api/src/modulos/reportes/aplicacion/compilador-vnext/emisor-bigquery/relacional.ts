import type { EntornoExpresionQlik } from "../expresiones-qlik.js";
import type { RelacionVNext } from "../ir.js";
import { nombreCampoDual } from "../mapping-applymap.js";
import type { CampoLoadVNext } from "../parser-carga.js";
import { fail, qlik, quote, wrap } from "./utilidades.js";

export function emitirJoin(
  relation: Extract<RelacionVNext, { op: "join" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
): string {
  const left = byId.get(relation.left);
  const right = byId.get(relation.right);
  if (!left || !right)
    fail(
      "BIGQUERY_JOIN_INPUT_MISSING",
      "JOIN referencia una relación inexistente",
    );
  const fields: string[] = [];
  for (const field of left.fields) {
    if (
      relation.keys.includes(field) &&
      (relation.join === "right" || relation.join === "full")
    ) {
      fields.push(
        `COALESCE(l.${quote(field)}, r.${quote(field)}) AS ${quote(field)}`,
      );
    } else {
      fields.push(`l.${quote(field)} AS ${quote(field)}`);
    }
  }
  for (const field of right.fields) {
    if (!left.fields.includes(field))
      fields.push(`r.${quote(field)} AS ${quote(field)}`);
  }
  const on = relation.keys
    .map((key) => `l.${quote(key)} = r.${quote(key)}`)
    .join(" AND ");
  return `SELECT\n  ${fields.join(",\n  ")}\nFROM ${wrap(emit(left.id), "l")}\n${relation.join.toUpperCase()} JOIN ${wrap(
    emit(right.id),
    "r",
  )}\n  ON ${on}`;
}

export function emitirUnion(
  relation: Extract<RelacionVNext, { op: "union_all" }>,
  byId: Map<string, RelacionVNext>,
  emit: (id: string) => string,
): string {
  const flattened = aplanarUnionSimple(relation.inputs, byId);
  if (
    flattened?.every(
      (input) =>
        input.fields.length === relation.fields.length &&
        input.fields.every((field, index) => field === relation.fields[index]),
    )
  )
    return flattened.map((input) => emit(input.id)).join("\nUNION ALL\n");

  return relation.inputs
    .map((id, index) => {
      const input = byId.get(id);
      if (!input)
        fail("BIGQUERY_UNION_INPUT_MISSING", `UNION referencia ${id}`);
      const alias = `u${index + 1}`;
      const fields = relation.fields
        .map((field) =>
          input.fields.includes(field)
            ? `${alias}.${quote(field)} AS ${quote(field)}`
            : `NULL AS ${quote(field)}`,
        )
        .join(",\n  ");
      return `SELECT\n  ${fields}\nFROM ${wrap(emit(id), alias)}`;
    })
    .join("\nUNION ALL\n");
}

export function aplanarUnionSimple(
  inputs: string[],
  byId: Map<string, RelacionVNext>,
): RelacionVNext[] | undefined {
  const flattened: RelacionVNext[] = [];
  for (const id of inputs) {
    const input = byId.get(id);
    if (!input) return undefined;
    if (input.op === "union_all") {
      const nested = aplanarUnionSimple(input.inputs, byId);
      if (!nested) return undefined;
      flattened.push(...nested);
      continue;
    }
    if (input.op !== "inline" && input.op !== "autogenerate") return undefined;
    flattened.push(input);
  }
  return flattened;
}

export function emitirSemiFilter(
  relation: Extract<RelacionVNext, { op: "semi_filter" }>,
  emit: (id: string) => string,
): string {
  const on = relation.keys
    .map((key) => `i.${quote(key)} = k.${quote(key)}`)
    .join(" AND ");
  return `SELECT i.*\nFROM ${wrap(emit(relation.input), "i")}\nWHERE EXISTS (\n  SELECT 1\n  FROM ${wrap(
    emit(relation.against),
    "k",
    2,
  )}\n  WHERE ${on}\n)`;
}

export function emitFields(
  fields: CampoLoadVNext[],
  environment: EntornoExpresionQlik,
  relation: {
    dualExpressions?: Record<string, string>;
    dualComponents?: RelacionVNext["dualComponents"];
  },
  includeInternal: boolean,
): string {
  const visible = fields
    .map((field) => {
      if (field.expression === "*") return "*";
      const expression = qlik(field.expression, "value", environment);
      if (sameIdentifier(field.expression, field.alias)) return expression;
      return `${expression} AS ${quote(field.alias)}`;
    })
    .join(",\n  ");
  if (!includeInternal || !relation.dualExpressions) return visible;
  const internals = Object.entries(relation.dualExpressions).flatMap(
    ([alias, expression]) => {
      const components = relation.dualComponents?.[alias] ?? {
        numericField: nombreCampoDual(alias, "numeric"),
        textField: nombreCampoDual(alias, "text"),
      };
      return [
        `${qlik(expression, "numeric_component", environment)} AS ${quote(
          components.numericField,
        )}`,
        ...(components.textField === alias
          ? []
          : [
              `${qlik(expression, "text", environment)} AS ${quote(
                components.textField,
              )}`,
            ]),
      ];
    },
  );
  return [...(visible ? [visible] : []), ...internals].join(",\n  ");
}

export function mismaExpresionQlik(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\[([^\]]+)\]/g, "$1")
      .toLowerCase();
  return normalize(left) === normalize(right);
}

export function sameIdentifier(expression: string, alias: string): boolean {
  const normalized = expression
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^`|`$/g, "")
    .split(".")
    .at(-1);
  return normalized === alias;
}

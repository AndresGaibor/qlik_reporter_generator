import type { ComponentesDualVNext, RelacionVNext } from "../ir.js";

export function metadataDualUnion(
  inputs: readonly RelacionVNext[],
  fields: readonly string[],
): Pick<RelacionVNext, "dualFields" | "dualComponents" | "internalFields"> {
  const dualFields = fields.filter((field) =>
    inputs.some(
      (input) =>
        input.dualFields?.includes(field) ||
        Boolean(input.dualComponents?.[field]),
    ),
  );
  const dualComponents: Record<string, ComponentesDualVNext> = {};

  for (const field of dualFields) {
    let canonical: ComponentesDualVNext | undefined;
    let compatible = true;
    for (const input of inputs) {
      if (!input.fields.includes(field)) continue;
      const components = input.dualComponents?.[field];
      if (!components) {
        compatible = false;
        break;
      }
      if (
        canonical &&
        (canonical.numericField !== components.numericField ||
          canonical.textField !== components.textField)
      ) {
        compatible = false;
        break;
      }
      canonical = components;
    }
    if (compatible && canonical) dualComponents[field] = canonical;
  }

  return {
    dualFields,
    dualComponents,
    internalFields: Object.keys(dualComponents),
  };
}

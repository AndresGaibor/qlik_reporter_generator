export type ComponenteDual = "numeric" | "text";

export function nombreCampoDual(
  field: string,
  component: ComponenteDual,
): string {
  return `__qlik_dual_${nombreInterno(field)}__${component}`;
}

export function nombreCampoHit(
  mappingName: string,
  valueField: string,
): string {
  return `__qlik_map_${nombreInterno(mappingName)}_${nombreInterno(valueField)}_hit`;
}

function nombreInterno(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_");
  return normalized || "field";
}

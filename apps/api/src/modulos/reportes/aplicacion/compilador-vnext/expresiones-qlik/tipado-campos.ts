import type { MetadataCampoBigQuery } from "../../../../google-cloud/dominio/metadata-bigquery.js";
import type { EntornoExpresionQlik } from "./tipos.js";

export const TIPOS_NUMERICOS_BIGQUERY = new Set([
  "INT64",
  "INTEGER",
  "FLOAT64",
  "FLOAT",
  "NUMERIC",
  "DECIMAL",
  "BIGNUMERIC",
  "BIGDECIMAL",
]);

export const TIPOS_TEMPORALES_BIGQUERY = new Set([
  "DATE",
  "DATETIME",
  "TIME",
  "TIMESTAMP",
]);

export function metadataCampoBigQuery(
  name: string,
  environment: EntornoExpresionQlik,
): MetadataCampoBigQuery | undefined {
  const exact = environment.fieldMetadata?.[name];
  if (exact) return exact;
  const metadataKey = Object.keys(environment.fieldMetadata ?? {}).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  if (metadataKey) return environment.fieldMetadata?.[metadataKey];
  const type = tipoCampoBigQueryLegacy(name, environment);
  return type ? { type, mode: "NULLABLE" } : undefined;
}

export function tipoCampoBigQuery(
  name: string,
  environment: EntornoExpresionQlik,
): string | undefined {
  return metadataCampoBigQuery(name, environment)?.type.toUpperCase();
}

export function esTipoNumericoBigQuery(type?: string): boolean {
  return !!type && TIPOS_NUMERICOS_BIGQUERY.has(type.toUpperCase());
}

export function esTipoTextoBigQuery(type?: string): boolean {
  return type?.toUpperCase() === "STRING";
}

function tipoCampoBigQueryLegacy(
  name: string,
  environment: EntornoExpresionQlik,
): string | undefined {
  const exact = environment.fieldTypes?.[name];
  if (exact) return exact.toUpperCase();
  const key = Object.keys(environment.fieldTypes ?? {}).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? environment.fieldTypes?.[key]?.toUpperCase() : undefined;
}

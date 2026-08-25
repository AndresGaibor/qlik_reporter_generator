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

export function esTipoTemporalBigQuery(type?: string): boolean {
  return !!type && TIPOS_TEMPORALES_BIGQUERY.has(type.toUpperCase());
}

export function esRepeated(metadata?: MetadataCampoBigQuery): boolean {
  return metadata?.mode === "REPEATED";
}

export function esTipoEscalar(metadata?: MetadataCampoBigQuery): boolean {
  if (!metadata) return true;
  if (metadata.mode === "REPEATED") return false;
  const t = metadata.type.toUpperCase();
  return !["RECORD", "STRUCT", "JSON", "GEOGRAPHY", "BYTES"].includes(t);
}

export function esTipoComplejo(metadata?: MetadataCampoBigQuery): boolean {
  if (!metadata) return false;
  if (metadata.mode === "REPEATED") return true;
  const t = metadata.type.toUpperCase();
  return ["RECORD", "STRUCT", "JSON", "GEOGRAPHY", "BYTES"].includes(t);
}

export function nombreTipoLegible(metadata?: MetadataCampoBigQuery): string {
  if (!metadata) return "desconocido";
  const t = metadata.type.toUpperCase();
  if (metadata.mode === "REPEATED") return `${t} (ARRAY)`;
  return t;
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

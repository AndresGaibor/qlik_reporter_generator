import type { Readable, Writable } from "node:stream";
import { URI_BASE_GCS_REPORTES } from "../../reportes/dominio/destino-gcs.js";

export const BUCKET_GCS_PERMITIDO = "bkt_dwh";

export const PREFIJO_GCS_PERMITIDO = "POCs/TalendDescargados/";

export interface ArchivoGcs {
  nombre: string;
  rutaCompleta: string;
  tamanoBytes: number;
  formato?: "CSV" | "CSV.GZ" | "PARQUET";
  fecha?: string | null;
}

export interface ResultadoDirectorioGcs {
  carpetas: string[];
  archivos: ArchivoGcs[];
}

export interface PuertoAlmacenamientoDescargas {
  listar(prefijo: string): Promise<ArchivoGcs[]>;
  listarDirectorio?(prefijo: string): Promise<ResultadoDirectorioGcs>;
  estaFinalizada(prefijo: string): Promise<boolean>;
  firmar(nombreObjeto: string, minutos: number): Promise<string>;
  eliminarArchivo?(nombreObjeto: string): Promise<void>;
  eliminarPrefijo?(prefijo: string): Promise<number>;
  abrirLectura?(nombreObjeto: string): Readable;
  abrirEscritura?(nombreObjeto: string): Writable;
}

export function parsearUriGcsPermitida(uri: string): {
  bucket: string;
  prefijo: string;
} {
  const match = uri
    .trim()
    .match(/^gs:\/\/([a-z0-9][a-z0-9._-]{1,61}[a-z0-9])\/(.+)$/);
  if (!match)
    throw new Error("URI GCS inv?lida: formato debe ser gs://bucket/ruta/");
  const bucket = match[1];
  let prefijo = match[2];
  if (!bucket || !prefijo || prefijo.split("/").includes("..")) {
    throw new Error("URI GCS inv?lida");
  }
  if (!prefijo.endsWith("/")) prefijo += "/";
  return { bucket, prefijo };
}

export { URI_BASE_GCS_REPORTES };

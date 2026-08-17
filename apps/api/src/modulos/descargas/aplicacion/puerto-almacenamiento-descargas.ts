import { URI_BASE_GCS_REPORTES } from "../../reportes/dominio/destino-gcs.js";

export const BUCKET_GCS_PERMITIDO = "bkt_dwh";

export const PREFIJO_GCS_PERMITIDO = "POCs/TalendDescargados/";

export interface ArchivoGcs {
  nombre: string;
  rutaCompleta: string;
  tamanoBytes: number;
}

export interface PuertoAlmacenamientoDescargas {
  listar(prefijo: string): Promise<ArchivoGcs[]>;
  firmar(nombreObjeto: string, minutos: number): Promise<string>;
}

export function parsearUriGcsPermitida(uri: string): {
  bucket: string;
  prefijo: string;
} {
  const regex = /^gs:\/\/([^/]+)\/(.+)\/?$/;
  const match = uri.match(regex);

  if (!match) {
    throw new Error("URI GCS inválida: formato debe ser gs://bucket/ruta/");
  }

  const [, bucket, ruta] = match;

  if (bucket !== BUCKET_GCS_PERMITIDO) {
    throw new Error(`Bucket no permitido: ${bucket}`);
  }

  if (!ruta.startsWith(PREFIJO_GCS_PERMITIDO)) {
    throw new Error(
      `Ruta no permitida: debe comenzar con ${PREFIJO_GCS_PERMITIDO}`,
    );
  }

  return { bucket, prefijo: ruta };
}

export { URI_BASE_GCS_REPORTES };

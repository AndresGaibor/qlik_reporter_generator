import { type Bucket, type File, Storage } from "@google-cloud/storage";
import {
  type ArchivoGcs,
  BUCKET_GCS_PERMITIDO,
  type PuertoAlmacenamientoDescargas,
} from "../aplicacion/puerto-almacenamiento-descargas.js";

export interface OpcionesClienteGcs {
  projectId: string;
  credencialesJson?: string;
  storage?: Storage;
}

export class ClienteGcs implements PuertoAlmacenamientoDescargas {
  private readonly storage: Storage;

  constructor(opciones: OpcionesClienteGcs) {
    if (opciones.storage) {
      this.storage = opciones.storage;
    } else {
      const credenciales = opciones.credencialesJson
        ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
        : undefined;
      this.storage = new Storage({
        projectId: opciones.projectId,
        ...(credenciales ? { credentials: credenciales } : {}),
      });
    }
  }

  async listar(prefijo: string): Promise<ArchivoGcs[]> {
    const [archivos] = await this.storage
      .bucket(BUCKET_GCS_PERMITIDO)
      .getFiles({ prefix: prefijo });

    return archivos
      .filter((archivo) => !archivo.name.endsWith("/"))
      .map((archivo) => ({
        nombre: archivo.name.split("/").pop() ?? archivo.name,
        rutaCompleta: archivo.name,
        tamanoBytes: Number(archivo.metadata.size),
      }));
  }

  async firmar(nombreObjeto: string, minutos: number): Promise<string> {
    const archivo = this.storage
      .bucket(BUCKET_GCS_PERMITIDO)
      .file(nombreObjeto);

    const [signedUrl] = await archivo.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + minutos * 60_000,
    });

    return signedUrl;
  }
}

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
  bucket?: string;
}

export class ClienteGcs implements PuertoAlmacenamientoDescargas {
  private readonly storage: Storage;
  private readonly bucket: string;

  constructor(opciones: OpcionesClienteGcs) {
    this.bucket = opciones.bucket ?? BUCKET_GCS_PERMITIDO;
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
      .bucket(this.bucket)
      .getFiles({ prefix: prefijo });

    return archivos
      .filter((archivo) => {
        if (archivo.name.endsWith("/")) return false;
        const nombre = archivo.name.split("/").at(-1) ?? "";
        if (nombre.startsWith("__finalizado__-")) return false;
        return /\.(csv|csv\.gz|parquet)$/i.test(nombre);
      })
      .map((archivo) => this.mapearArchivo(archivo));
  }

  async listarDirectorio(prefijo: string) {
    const respuesta = await this.storage
      .bucket(this.bucket)
      .getFiles({ prefix: prefijo, delimiter: "/" });
    const archivos = respuesta[0] ?? [];
    const apiResponse = respuesta[2] as { prefixes?: string[] } | undefined;
    const carpetas = (apiResponse?.prefixes ?? []).map((ruta) =>
      ruta.slice(prefijo.length),
    );
    return {
      carpetas,
      archivos: archivos
        .filter((archivo) => !archivo.name.endsWith("/"))
        .filter((archivo) => /\.(csv|csv\.gz|parquet)$/i.test(archivo.name))
        .filter(
          (archivo) =>
            !(archivo.name.split("/").at(-1) ?? "").startsWith(
              "__finalizado__-",
            ),
        )
        .map((archivo) => this.mapearArchivo(archivo)),
    };
  }

  private mapearArchivo(archivo: File): ArchivoGcs {
    const nombre = archivo.name.split("/").pop() ?? archivo.name;
    const formato = nombre.toLowerCase().endsWith(".csv.gz")
      ? "CSV.GZ"
      : nombre.toLowerCase().endsWith(".parquet")
        ? "PARQUET"
        : "CSV";
    const fechaRaw = archivo.metadata.updated ?? archivo.metadata.timeCreated;
    return {
      nombre,
      rutaCompleta: archivo.name,
      tamanoBytes: Number(archivo.metadata.size ?? 0),
      formato,
      fecha: fechaRaw ? new Date(String(fechaRaw)).toISOString() : null,
    };
  }

  async estaFinalizada(prefijo: string): Promise<boolean> {
    const [archivos] = await this.storage.bucket(this.bucket).getFiles({
      prefix: `${prefijo}__finalizado__-`,
      maxResults: 1,
    });
    return archivos.some((archivo) => !archivo.name.endsWith("/"));
  }

  async eliminarArchivo(nombreObjeto: string): Promise<void> {
    await this.storage.bucket(this.bucket).file(nombreObjeto).delete();
  }

  async eliminarPrefijo(prefijo: string): Promise<number> {
    const [archivos] = await this.storage
      .bucket(this.bucket)
      .getFiles({ prefix: prefijo });
    const eliminables = archivos.filter(
      (archivo) => !archivo.name.endsWith("/"),
    );
    await Promise.all(eliminables.map((archivo) => archivo.delete()));
    return eliminables.length;
  }

  async firmar(nombreObjeto: string, minutos: number): Promise<string> {
    const archivo = this.storage.bucket(this.bucket).file(nombreObjeto);

    const nombre = nombreObjeto.split("/").at(-1) ?? "reporte.csv.gz";
    const [signedUrl] = await archivo.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + minutos * 60_000,
      responseDisposition: `attachment; filename="${nombre}"`,
    });

    return signedUrl;
  }
}

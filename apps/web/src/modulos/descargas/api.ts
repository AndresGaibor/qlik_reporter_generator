import { ErrorClienteApi, clienteApi } from "@/compartido/api/cliente";
import type {
  ManifiestoDescarga,
  ResumenDescargaEjecucion,
} from "@qlik/contratos/descargas";

export type { ResumenDescargaEjecucion };
export type { ManifiestoDescarga };

export function listarDescargas(): Promise<ResumenDescargaEjecucion[]> {
  return clienteApi.get<ResumenDescargaEjecucion[]>("/descargas");
}

export function listarDescargasAdministracion(): Promise<
  ResumenDescargaEjecucion[]
> {
  return clienteApi.get<ResumenDescargaEjecucion[]>("/descargas/administracion");
}

export function solicitarManifiesto(id: string): Promise<ManifiestoDescarga> {
  return clienteApi.post<ManifiestoDescarga>(
    `/descargas/${encodeURIComponent(id)}/manifiesto`,
  );
}

export interface ArchivoExploradorGcs {
  nombre: string;
  formato: "CSV" | "CSV.GZ" | "PARQUET";
  tamano: number;
  fecha: string | null;
}

export interface ExploradorGcs {
  bucket: string;
  prefijoBase: string;
  ruta: string;
  carpetas: string[];
  archivos: ArchivoExploradorGcs[];
}

export async function listarExploradorGcs(
  ruta = "",
): Promise<ExploradorGcs | null> {
  try {
    return await clienteApi.get<ExploradorGcs>("/descargas/explorador", {
      parametros: ruta ? { ruta } : undefined,
    });
  } catch (error) {
    if (error instanceof ErrorClienteApi && error.estado === 403) return null;
    throw error;
  }
}

export function firmarArchivoExploradorGcs(ruta: string) {
  return clienteApi.post<{ nombre: string; url: string }>(
    "/descargas/explorador/firma",
    { ruta },
  );
}

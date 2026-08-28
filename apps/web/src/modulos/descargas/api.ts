import { ErrorClienteApi, clienteApi } from "@/compartido/api/cliente";
import type {
  CompartirDescarga,
  ManifiestoDescarga,
  ResumenDescargaEjecucion,
  UsuarioCompartible,
} from "@qlik/contratos/descargas";

export type { ResumenDescargaEjecucion };
export type { ManifiestoDescarga };

export function listarDescargas(): Promise<ResumenDescargaEjecucion[]> {
  return clienteApi.get<ResumenDescargaEjecucion[]>("/descargas");
}

export function listarDescargasAdministracion(): Promise<
  ResumenDescargaEjecucion[]
> {
  return clienteApi.get<ResumenDescargaEjecucion[]>(
    "/descargas/administracion",
  );
}

export function solicitarManifiesto(id: string): Promise<ManifiestoDescarga> {
  return clienteApi.post<ManifiestoDescarga>(
    `/descargas/${encodeURIComponent(id)}/manifiesto`,
  );
}

export function urlZipEjecucion(id: string) {
  return `/api/descargas/${encodeURIComponent(id)}/zip`;
}

export interface ParteCsvNormalizada {
  numero: number;
  nombre: string;
  tamano: number;
  url: string;
}

export function listarPartesNormalizadas(id: string) {
  return clienteApi.get<{
    estado: "preparando" | "lista";
    partes: ParteCsvNormalizada[];
  }>(`/descargas/${encodeURIComponent(id)}/partes`);
}

export function listarUsuariosCompartibles() {
  return clienteApi.get<UsuarioCompartible[]>(
    "/descargas/usuarios-compartibles",
  );
}

export function obtenerCompartidoDescarga(id: string) {
  return clienteApi.get<CompartirDescarga>(
    `/descargas/${encodeURIComponent(id)}/compartido`,
  );
}

export function guardarCompartidoDescarga(
  id: string,
  entrada: CompartirDescarga,
) {
  return clienteApi.put<CompartirDescarga>(
    `/descargas/${encodeURIComponent(id)}/compartido`,
    entrada,
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

export interface CarpetaEjecucionGcs {
  carpeta: string;
  ejecucionId: string;
  ejecutadoEn: string;
  esMasReciente: boolean;
}

export interface EjecucionActualCarpetaGcs {
  ejecucionId: string;
  ejecutadoEn: string;
}

export interface CarpetaUsuarioGcs extends ExploradorGcs {
  carpetaUsuario: string;
  carpetasEjecucion?: CarpetaEjecucionGcs[];
  ejecucionActual?: EjecucionActualCarpetaGcs | null;
}

export interface CarpetaRegistradaGcs {
  usuarioId: string;
  correo: string | null;
  carpeta: string;
}

export function listarCarpetaUsuarioGcs(ruta = ""): Promise<CarpetaUsuarioGcs> {
  return clienteApi.get<CarpetaUsuarioGcs>("/descargas/carpeta", {
    parametros: ruta ? { ruta } : undefined,
  });
}

export function firmarArchivoCarpetaUsuarioGcs(ruta: string) {
  return clienteApi.post<{ nombre: string; url: string }>(
    "/descargas/carpeta/firma",
    { ruta },
  );
}

export function listarCarpetasUsuariosGcs(): Promise<CarpetaRegistradaGcs[]> {
  return clienteApi.get<CarpetaRegistradaGcs[]>(
    "/descargas/administracion/carpetas",
  );
}

export function eliminarArchivoCarpetaUsuarioGcs(ruta: string) {
  return clienteApi.delete<{ eliminado: string }>(
    "/descargas/carpeta/archivo",
    { parametros: { ruta } },
  );
}

export function eliminarDirectorioCarpetaUsuarioGcs(ruta: string) {
  return clienteApi.delete<{ eliminado: string; objetosEliminados: number }>(
    "/descargas/carpeta/directorio",
    { parametros: { ruta } },
  );
}

export function urlCsvParteCarpetaUsuarioGcs(
  ruta: string,
  archivo: string,
): string {
  const query = new URLSearchParams({ ruta, archivo }).toString();
  return `/api/descargas/carpeta/csv?${query}`;
}

export function urlZipCarpetaUsuarioGcs(ruta = ""): string {
  const query = new URLSearchParams(ruta ? { ruta } : {}).toString();
  return `/api/descargas/carpeta/zip${query ? `?${query}` : ""}`;
}

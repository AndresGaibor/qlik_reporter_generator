import { z } from "zod";

export const esquemaArchivoDescarga = z.object({
  nombre: z.string().min(1),
  formato: z.enum(["CSV", "CSV.GZ", "PARQUET"]),
  tamano: z.number().nonnegative(),
  fecha: z.string().datetime().nullable(),
  url: z.string().url(),
});
export type ArchivoDescarga = z.infer<typeof esquemaArchivoDescarga>;

export const esquemaManifiestoDescarga = z.object({
  descargaId: z.string().uuid(),
  archivos: z.array(esquemaArchivoDescarga).min(1),
});
export type ManifiestoDescarga = z.infer<typeof esquemaManifiestoDescarga>;

export type EstadoResumenDescarga =
  | "preparando"
  | "iniciada"
  | "completada"
  | "error"
  | "detenida";

export const esquemaArchivoResumenDescarga = z.object({
  nombre: z.string().min(1),
  formato: z.enum(["CSV", "CSV.GZ", "PARQUET"]),
  tamano: z.number().nonnegative(),
  fecha: z.string().datetime().nullable(),
});
export type ArchivoResumenDescarga = z.infer<
  typeof esquemaArchivoResumenDescarga
>;

export const esquemaResumenDescargaEjecucion = z.object({
  id: z.string().uuid(),
  creadoPorUsuarioId: z.string().uuid().nullable().optional(),
  reporteNombre: z.string(),
  automatizacionIdQlik: z.string(),
  estado: z.string(),
  mensajeError: z.string().nullable(),
  creadoEn: z.string().datetime(),
  finalizadoEn: z.string().datetime().nullable(),
  archivos: z.array(esquemaArchivoResumenDescarga).default([]),
});
export type ResumenDescargaEjecucion = z.infer<
  typeof esquemaResumenDescargaEjecucion
>;

export interface ServicioDescargas {
  crearManifiesto(
    ejecucionId: string,
    contexto: ContextoDescarga,
  ): Promise<ManifiestoDescarga>;
  listarEjecuciones(
    contexto: ContextoDescarga,
    limite?: number,
  ): Promise<ResumenDescargaEjecucion[]>;
}

export interface ContextoDescarga {
  tenantQlikId: string;
  organizacionId: string;
  usuarioId?: string;
  esAdministrador?: boolean;
}

import { z } from "zod";

export const esquemaArchivoDescarga = z.object({
  nombre: z.string().min(1),
  tamano: z.number().nonnegative(),
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

export const esquemaResumenDescargaEjecucion = z.object({
  id: z.string().uuid(),
  reporteNombre: z.string(),
  automatizacionIdQlik: z.string(),
  estado: z.string(),
  mensajeError: z.string().nullable(),
  creadoEn: z.string().datetime(),
  finalizadoEn: z.string().datetime().nullable(),
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
}

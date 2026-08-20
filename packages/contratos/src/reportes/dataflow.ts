import { z } from "zod";

export const esquemaEstadoEjecucionReporte = z.enum([
  "preparando",
  "iniciada",
  "completada",
  "error",
  "detenida",
]);
export type EstadoEjecucionReporte = z.infer<
  typeof esquemaEstadoEjecucionReporte
>;

export const esquemaResumenDataflowReporte = z.object({
  fuentes: z.number().int().nonnegative(),
  filtros: z.number().int().nonnegative(),
  joins: z.number().int().nonnegative(),
  camposSalida: z.number().int().nonnegative(),
});

export const esquemaPreflightDataflowReporte = z.object({
  flujoIdQlik: z.string().trim().min(1),
  hashDataflowSha256: z.string().regex(/^[a-f0-9]{64}$/),
  compatible: z.boolean(),
  operacionesNoSoportadas: z.array(z.string()),
  sqlBigQuery: z.string(),
  bytesProcesados: z.number().nonnegative(),
  costoEstimadoUsd: z.number().nonnegative(),
  validacionBigQuery: z.object({
    exitosa: z.boolean(),
    mensajeError: z.string().nullable(),
  }),
  resumen: esquemaResumenDataflowReporte,
});
export type PreflightDataflowReporte = z.infer<
  typeof esquemaPreflightDataflowReporte
>;

export const esquemaDetalleEjecucionReporte = z.object({
  id: z.string().uuid(),
  organizacionId: z.string().uuid(),
  tenantQlikId: z.string().uuid(),
  flujoIdQlik: z.string(),
  flujoNombreSnapshot: z.string(),
  flujoEspacioIdQlik: z.string().nullable(),
  automatizacionIdQlik: z.string(),
  runIdQlik: z.string().nullable(),
  ejecutadoPorUsuarioId: z.string().uuid().nullable(),
  automatizacionPersonalId: z.string().uuid().nullable(),
  hashDataflowSha256: z.string().regex(/^[a-f0-9]{64}$/),
  scriptDataflow: z.string(),
  sqlBigQueryCompilado: z.string(),
  scriptExportacion: z.string(),
  uriBaseGcs: z.string().startsWith("gs://"),
  estado: esquemaEstadoEjecucionReporte,
  versionCompilador: z.number().int().positive(),
  etapaError: z.string().nullable(),
  mensajeError: z.string().nullable(),
  iniciadoEn: z.string().datetime().nullable(),
  finalizadoEn: z.string().datetime().nullable(),
  creadoEn: z.string().datetime(),
});
export type DetalleEjecucionReporte = z.infer<
  typeof esquemaDetalleEjecucionReporte
>;

export const esquemaResumenReporte = z
  .object({
    id: z.string().trim().min(1),
    nombre: z.string(),
    espacioId: z.string().nullable(),
    espacioNombre: z.string().nullable(),
    modificadoEn: z.string().datetime().nullable(),
    creadoEn: z.string().datetime().nullable().optional(),
    ultimaEjecucionEn: z.string().datetime().nullable().optional(),
  })
  .strict();
export type ResumenReporte = z.infer<typeof esquemaResumenReporte>;

export const esquemaDetalleReporte = esquemaResumenReporte;
export type DetalleReporte = z.infer<typeof esquemaDetalleReporte>;

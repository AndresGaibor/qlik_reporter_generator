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
  resumen: esquemaResumenDataflowReporte,
});
export type PreflightDataflowReporte = z.infer<
  typeof esquemaPreflightDataflowReporte
>;

export const esquemaDetalleEjecucionReporte = z.object({
  id: z.string().uuid(),
  configuracionId: z.string().uuid(),
  flujoIdQlik: z.string(),
  automatizacionIdQlik: z.string(),
  runIdQlik: z.string().nullable(),
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

export const esquemaActualizarConfiguracionReporte = z
  .object({
    nombre: z.string().trim().min(1).max(255).optional(),
    flujoIdQlik: z.string().trim().min(1).optional(),
    activa: z.boolean().optional(),
  })
  .strict();
export type ActualizarConfiguracionReporte = z.infer<
  typeof esquemaActualizarConfiguracionReporte
>;

export const esquemaConfiguracionReporteDataflow = z
  .object({
    id: z.string().uuid(),
    nombre: z.string(),
    flujoIdQlik: z.string(),
    flujoNombreSnapshot: z.string(),
    flujoEspacioIdQlik: z.string().nullable(),
    automatizacionIdQlik: z.string(),
    automatizacionNombreSnapshot: z.string(),
    destinoGcs: z.string().startsWith("gs://"),
    activa: z.boolean(),
  })
  .strict();
export type ConfiguracionReporteDataflow = z.infer<
  typeof esquemaConfiguracionReporteDataflow
>;

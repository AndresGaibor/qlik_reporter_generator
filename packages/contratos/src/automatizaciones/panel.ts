import { z } from "zod";
import { esquemaIdQlik } from "../qlik/comunes.js";

export const esquemaResumenAutomatizacion = z.object({
  id: esquemaIdQlik,
  nombre: z.string(),
  espacioId: esquemaIdQlik.optional(),
  espacioNombre: z.string(),
  propietarioId: esquemaIdQlik.optional(),
  propietarioNombre: z.string(),
  activa: z.boolean(),
  modoEjecucion: z.string(),
  ejecucionActiva: z.boolean(),
  puedeEjecutar: z.boolean(),
  ultimaEjecucionEstado: z.string().optional(),
  ultimaEjecucionInicio: z.string().optional(),
  ultimaEjecucionFin: z.string().optional(),
  creadoEn: z.string(),
  modificadoEn: z.string(),
});
export type ResumenAutomatizacion = z.infer<
  typeof esquemaResumenAutomatizacion
>;

export const esquemaReemplazoWorkspace = z.object({
  ruta: z
    .string()
    .min(1)
    .max(1000)
    .regex(
      /^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/,
      "Ruta JSON Pointer inválida",
    ),
  valor: z.unknown(),
});

export const esquemaCrearDesdePlantilla = z
  .object({
    nombre: z.string().trim().min(1).max(255),
    plantillaIdQlik: esquemaIdQlik,
    espacioIdQlik: esquemaIdQlik.optional(),
    propietarioIdQlik: esquemaIdQlik.optional(),
    flujoId: z.string().trim().min(1),
    tablaId: z.string().optional(),
    autor: z.string().optional(),
    fechaDesde: z.string().optional(),
    fechaHasta: z.string().optional(),
    columnas: z.array(z.string()).optional(),
    formatoSalida: z.string().optional(),
    destinoId: z.string().uuid().optional(),
    reemplazosWorkspace: z
      .array(esquemaReemplazoWorkspace)
      .max(100)
      .optional()
      .default([]),
    claveIdempotencia: z.string().trim().min(8).max(255).optional(),
  })
  .strict();
export type CrearDesdePlantilla = z.infer<typeof esquemaCrearDesdePlantilla>;

export const esquemaResultadoCrearDesdePlantilla = z.object({
  id: esquemaIdQlik,
  nombre: z.string(),
  plantillaIdQlik: esquemaIdQlik,
});
export type ResultadoCrearDesdePlantilla = z.infer<
  typeof esquemaResultadoCrearDesdePlantilla
>;

export const esquemaEjecucionAutomatizacion = z.object({
  id: esquemaIdQlik,
  automatizacionId: esquemaIdQlik.optional(),
  estado: z.string(),
  iniciadoEn: z.string().optional(),
  finalizadoEn: z.string().optional(),
  error: z.unknown().optional(),
});
export type EjecucionAutomatizacion = z.infer<
  typeof esquemaEjecucionAutomatizacion
>;

export const esquemaDetalleAutomatizacion = z.object({
  automatizacion: esquemaResumenAutomatizacion,
  ejecuciones: z.array(esquemaEjecucionAutomatizacion),
});
export type DetalleAutomatizacion = z.infer<
  typeof esquemaDetalleAutomatizacion
>;

export const esquemaEspacioDisponible = z.object({
  id: esquemaIdQlik,
  nombre: z.string(),
  tipo: z.string(),
  propietarioId: esquemaIdQlik.optional(),
  roles: z.array(z.string()),
  acciones: z.array(z.string()),
});
export type EspacioDisponible = z.infer<typeof esquemaEspacioDisponible>;

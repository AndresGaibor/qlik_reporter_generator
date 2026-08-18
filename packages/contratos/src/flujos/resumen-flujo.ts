import { z } from "zod";

export const esquemaResumenFlujo = z.object({
  id: z.string(),
  nombre: z.string(),
  espacioId: z.string().optional(),
  espacioNombre: z.string(),
  propietarioId: z.string().optional(),
  modificadoEn: z.string().optional(),
});

export type ResumenFlujo = z.infer<typeof esquemaResumenFlujo>;

export const esquemaDataflowBaseDisponible = z.object({
  id: z.string(),
  nombre: z.string(),
});

export type DataflowBaseDisponible = z.infer<
  typeof esquemaDataflowBaseDisponible
>;

export const esquemaClonarDataflowBase = z.object({
  nombre: z.string().trim().min(1).max(255),
});

export const esquemaResultadoClonarDataflowBase = z.object({
  id: z.string(),
  nombre: z.string(),
});

export type ResultadoClonarDataflowBase = z.infer<
  typeof esquemaResultadoClonarDataflowBase
>;

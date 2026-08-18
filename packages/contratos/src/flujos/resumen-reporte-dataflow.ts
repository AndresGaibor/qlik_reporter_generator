import { z } from "zod";

export const esquemaEstadoAnalisisDataflow = z.enum([
  "analizado",
  "script_no_compatible",
  "sin_filtros",
  "script_no_disponible",
]);

export const esquemaCampoResumenDataflow = z.object({
  nombreVisible: z.string(),
  alias: z.string(),
  tipoInferido: z.enum(["texto", "numero", "fecha", "fecha_hora"]).optional(),
});

export const esquemaFiltroResumenDataflow = z.object({
  etiqueta: z.string(),
  campo: z.string(),
  operador: z.string(),
  valorPredeterminado: z.string().optional(),
  obligatorio: z.boolean(),
});

export const esquemaResumenReporteDataflow = z.object({
  flujoId: z.string(),
  nombre: z.string(),
  descripcion: z.string().optional(),
  fuentePrincipal: z
    .object({
      nombre: z.string(),
      tabla: z.string(),
      dataset: z.string().optional(),
    })
    .optional(),
  tablaDestino: z.string().optional(),
  campos: z.array(esquemaCampoResumenDataflow),
  filtros: z.array(esquemaFiltroResumenDataflow),
  rangoTemporal: z
    .object({
      campo: z.string(),
      fechaInicial: z.string().optional(),
      fechaFinal: z.string().optional(),
    })
    .optional(),
  estado: esquemaEstadoAnalisisDataflow,
  advertencias: z.array(z.string()),
  analizadoEn: z.string().datetime(),
});

export type ResumenReporteDataflow = z.infer<
  typeof esquemaResumenReporteDataflow
>;

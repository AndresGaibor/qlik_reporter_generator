export const TIPOS_DESTINO = ["bigquery"] as const;

export type TipoDestino = (typeof TIPOS_DESTINO)[number];

export type TipoRecursoDestino = "tabla" | "dataset";

export interface CapacidadesDestino {
  listarRecursos: boolean;
  esquema: boolean;
  conteoRegistros: boolean;
  vistaPrevia: boolean;
  escritura: boolean;
}

export interface RecursoDestino {
  id: string;
  nombre: string;
  tipo: TipoRecursoDestino;
  espacioDeNombres?: string;
  ruta?: string;
  columnas?: Array<{ nombre: string; tipo: string }>;
  metadatos: Record<string, unknown>;
}

export interface DetalleRecursoDestino extends RecursoDestino {
  totalFilas?: number;
  actualizadoEn: string;
}

export interface ResultadoConsultaBigQuery {
  filas: Array<Record<string, unknown>>;
  bytesProcesados: number;
  costoEstimadoUsd: number;
}

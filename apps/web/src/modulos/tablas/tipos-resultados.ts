export interface DetalleResultadoBigQuery {
  id: string;
  nombre: string;
  tipo: "tabla" | "dataset" | "archivo" | "carpeta";
  espacioDeNombres?: string;
  ruta?: string;
  columnas?: Array<{ nombre: string; tipo: string }>;
  metadatos: Record<string, unknown>;
  totalFilas?: number;
  actualizadoEn: string;
}

export type PestanaResultado = "campos" | "preview";

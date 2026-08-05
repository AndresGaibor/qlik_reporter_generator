import type {
  CapacidadesDestino,
  DetalleRecursoDestino,
  RecursoDestino,
  TipoDestino,
} from "../../dominio/tipos-destino.js";

export interface PuertoDestino {
  readonly tipo: TipoDestino;
  obtenerCapacidades(): CapacidadesDestino;
  listarRecursos(): Promise<RecursoDestino[]>;
  obtenerRecurso(id: string): Promise<DetalleRecursoDestino>;
  probarConexion?(): Promise<void>;
  obtenerVistaPrevia?(id: string, limite: number): Promise<Array<Record<string, unknown>>>;
  obtenerDdl?(id: string): Promise<string | null>;
  estimarConsulta?(query: string): Promise<{ bytesProcesados: number; costoEstimadoUsd: number }>;
}

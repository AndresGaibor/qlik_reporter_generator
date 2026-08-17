export type DialectoExpresion = "qlik" | "bigquery";

export interface CampoDataflow {
  expresion: string;
  alias: string;
  dialecto: DialectoExpresion;
}

export interface FuenteBigQuery {
  id: string;
  tipo: "bigquery";
  conexion?: string;
  tabla: string;
  campos: CampoDataflow[];
  distinct?: boolean;
  agrupacion?: string[];
  orden?: OrdenDataflow[];
}

export interface OrdenDataflow {
  expresion: string;
  direccion: "asc" | "desc";
  dialecto: DialectoExpresion;
}

export type PasoDataflow =
  | {
      tipo: "filtrar";
      entrada: string;
      salida: string;
      condicion: string;
      dialecto: DialectoExpresion;
    }
  | {
      tipo: "proyectar";
      entrada: string;
      salida: string;
      campos: CampoDataflow[];
      distinct: boolean;
      agrupacion: string[];
      dialecto: DialectoExpresion;
    }
  | {
      tipo: "ordenar";
      entrada: string;
      salida: string;
      campos: OrdenDataflow[];
    }
  | {
      tipo: "join";
      join: "inner" | "left" | "right" | "full";
      izquierda: string;
      derecha: string;
      salida: string;
      claves: string[];
    };

export interface OperacionNoSoportada {
  operacion: string;
  detalle: string;
  contexto?: string;
}

export interface PlanDataflow {
  fuentes: FuenteBigQuery[];
  pasos: PasoDataflow[];
  salida: { tablaLogica: string; campos: string[] };
  operacionesNoSoportadas: OperacionNoSoportada[];
}

export class ErrorDataflowNoCompatible extends Error {
  constructor(public readonly operaciones: OperacionNoSoportada[]) {
    super(
      `Dataflow no compatible: ${operaciones.map((item) => item.operacion).join(", ")}`,
    );
    this.name = "ErrorDataflowNoCompatible";
  }
}

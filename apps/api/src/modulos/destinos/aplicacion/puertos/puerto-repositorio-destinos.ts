export interface ConexionDestinoEntidad {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  mensajeError: string | null;
  config: Record<string, unknown>;
  secretoRefs: Record<string, unknown>;
  esPredeterminada: boolean;
}

export interface EntradaCrearConexionDestino {
  organizacionId: string;
  tipo: string;
  nombre: string;
  config: Record<string, unknown>;
  secretoRefs: Record<string, unknown>;
  esPredeterminada?: boolean;
}

export interface EntradaActualizarConexionDestino {
  nombre?: string;
  config?: Record<string, unknown>;
  estado?: string;
  mensajeError?: string | null;
}

export interface PuertoRepositorioConexionesDestino {
  listarPorOrganizacion(
    organizacionId: string,
  ): Promise<ConexionDestinoEntidad[]>;
  obtenerPorId(id: string): Promise<ConexionDestinoEntidad | null>;
  crear(conexion: EntradaCrearConexionDestino): Promise<{ id: string }>;
  actualizar(
    id: string,
    cambios: EntradaActualizarConexionDestino,
  ): Promise<void>;
  eliminar(id: string): Promise<void>;
}

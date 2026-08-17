import { desc, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { conexionesDestino } from "../../../plataforma/persistencia/esquema.js";

type DbType = ConexionDb;

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

export class RepositorioConexionesDestinoPostgres {
  constructor(private readonly db: DbType) {}

  async listarPorOrganizacion(
    organizacionId: string,
  ): Promise<ConexionDestinoEntidad[]> {
    const filas = await this.db.query.conexionesDestino.findMany({
      where: (t, { eq }) => eq(t.organizacionId, organizacionId),
      orderBy: (t, { desc }) => [desc(t.esPredeterminada), desc(t.actualizadoEn)],
    });

    return filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      nombre: f.nombre,
      estado: f.estado,
      mensajeError: f.mensajeError,
      config: f.config as Record<string, unknown>,
      secretoRefs: f.secretoRefs as Record<string, unknown>,
      esPredeterminada: f.esPredeterminada,
    }));
  }

  async obtenerPorId(id: string): Promise<ConexionDestinoEntidad | null> {
    const fila = await this.db.query.conexionesDestino.findFirst({
      where: (t, { eq }) => eq(t.id, id),
    });

    if (!fila) return null;

    return {
      id: fila.id,
      tipo: fila.tipo,
      nombre: fila.nombre,
      estado: fila.estado,
      mensajeError: fila.mensajeError,
      config: fila.config as Record<string, unknown>,
      secretoRefs: fila.secretoRefs as Record<string, unknown>,
      esPredeterminada: fila.esPredeterminada,
    };
  }

  async crear(conexion: EntradaCrearConexionDestino): Promise<{ id: string }> {
    const [creada] = await this.db
      .insert(conexionesDestino)
      .values({
        organizacionId: conexion.organizacionId,
        tipo: conexion.tipo,
        nombre: conexion.nombre,
        config: conexion.config,
        secretoRefs: conexion.secretoRefs,
        estado: "activo",
        esPredeterminada: conexion.esPredeterminada ?? false,
      })
      .returning({ id: conexionesDestino.id });

    return { id: creada.id };
  }

  async actualizar(
    id: string,
    cambios: EntradaActualizarConexionDestino,
  ): Promise<void> {
    await this.db
      .update(conexionesDestino)
      .set({
        ...cambios,
        ...(cambios.config ? { config: cambios.config } : {}),
      })
      .where(eq(conexionesDestino.id, id));
  }

  async eliminar(id: string): Promise<void> {
    await this.db.delete(conexionesDestino).where(eq(conexionesDestino.id, id));
  }
}

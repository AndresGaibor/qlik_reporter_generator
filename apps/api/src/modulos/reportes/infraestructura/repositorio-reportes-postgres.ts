import { and, desc, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { ejecucionesReportes } from "../../../plataforma/persistencia/esquema.js";
import type {
  CrearEjecucionReportePersistida,
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
  ResumenEjecucionDescarga,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export class RepositorioReportesPostgres implements PuertoRepositorioReportes {
  constructor(private readonly db: ConexionDb) {}

  async crearEjecucion(
    entrada: CrearEjecucionReportePersistida,
  ): Promise<EjecucionReportePersistida> {
    const [fila] = await this.db
      .insert(ejecucionesReportes)
      .values(entrada)
      .returning();
    if (!fila) throw new Error("No se pudo crear la auditoría de ejecución");
    return mapearEjecucion(fila);
  }

  async marcarEjecucionIniciada(
    id: string,
    runIdQlik: string,
    iniciadoEn: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        runIdQlik,
        estado: "iniciada",
        iniciadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, id));
  }

  async marcarEjecucionError(
    id: string,
    etapaError: string,
    mensajeError: string,
    finalizadoEn: Date,
    runIdQlik?: string,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        ...(runIdQlik ? { runIdQlik } : {}),
        estado: "error",
        etapaError,
        mensajeError,
        finalizadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, id));
  }

  async marcarEjecucionCompletada(
    id: string,
    finalizadoEn: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({ estado: "completada", finalizadoEn, actualizadoEn: new Date() })
      .where(eq(ejecucionesReportes.id, id));
  }

  async listarEjecuciones(
    flujoIdQlik: string,
    tenantQlikId: string,
    organizacionId: string,
    limite = 50,
  ): Promise<EjecucionReportePersistida[]> {
    const filas = await this.db.query.ejecucionesReportes.findMany({
      where: and(
        eq(ejecucionesReportes.flujoIdQlik, flujoIdQlik),
        eq(ejecucionesReportes.tenantQlikId, tenantQlikId),
        eq(ejecucionesReportes.organizacionId, organizacionId),
      ),
      orderBy: [desc(ejecucionesReportes.creadoEn)],
      limit: Math.min(Math.max(limite, 1), 200),
    });
    return filas.map(mapearEjecucion);
  }

  async marcarEstadoEjecucion(
    id: string,
    estado: "completada" | "error" | "detenida",
    finalizadoEn: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({ estado, finalizadoEn, actualizadoEn: new Date() })
      .where(eq(ejecucionesReportes.id, id));
  }

  async listarEjecucionesDescargas(
    contexto: {
      tenantQlikId: string;
      organizacionId: string;
      usuarioId?: string;
      esAdministrador?: boolean;
    },
    limite = 100,
  ): Promise<ResumenEjecucionDescarga[]> {
    const usuarioId = contexto.esAdministrador ? undefined : contexto.usuarioId;
    if (!contexto.esAdministrador && !usuarioId) {
      throw new Error(
        "usuarioId es obligatorio para consultar descargas personales",
      );
    }
    const filas = await this.db
      .select({
        id: ejecucionesReportes.id,
        flujoIdQlik: ejecucionesReportes.flujoIdQlik,
        flujoNombreSnapshot: ejecucionesReportes.flujoNombreSnapshot,
        creadoPorUsuarioId: ejecucionesReportes.ejecutadoPorUsuarioId,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .where(
        and(
          eq(ejecucionesReportes.tenantQlikId, contexto.tenantQlikId),
          eq(ejecucionesReportes.organizacionId, contexto.organizacionId),
          ...(usuarioId
            ? [eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarioId)]
            : []),
        ),
      )
      .orderBy(desc(ejecucionesReportes.creadoEn))
      .limit(Math.min(Math.max(limite, 1), 100));
    return filas;
  }

  async obtenerEjecucionDescarga(contexto: {
    id: string;
    tenantQlikId: string;
    organizacionId: string;
    usuarioId?: string;
    esAdministrador?: boolean;
  }): Promise<ResumenEjecucionDescarga | null> {
    const usuarioId = contexto.esAdministrador ? undefined : contexto.usuarioId;
    if (!contexto.esAdministrador && !usuarioId) {
      throw new Error(
        "usuarioId es obligatorio para consultar una descarga personal",
      );
    }
    const [fila] = await this.db
      .select({
        id: ejecucionesReportes.id,
        flujoIdQlik: ejecucionesReportes.flujoIdQlik,
        flujoNombreSnapshot: ejecucionesReportes.flujoNombreSnapshot,
        creadoPorUsuarioId: ejecucionesReportes.ejecutadoPorUsuarioId,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .where(
        and(
          eq(ejecucionesReportes.id, contexto.id),
          eq(ejecucionesReportes.tenantQlikId, contexto.tenantQlikId),
          eq(ejecucionesReportes.organizacionId, contexto.organizacionId),
          ...(usuarioId
            ? [eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarioId)]
            : []),
        ),
      )
      .limit(1);
    return fila ?? null;
  }
}

function mapearEjecucion(
  fila: typeof ejecucionesReportes.$inferSelect,
): EjecucionReportePersistida {
  return {
    ...fila,
    ejecutadoPorUsuarioId: fila.ejecutadoPorUsuarioId,
    automatizacionPersonalId: fila.automatizacionPersonalId,
    estado: fila.estado as EjecucionReportePersistida["estado"],
  };
}

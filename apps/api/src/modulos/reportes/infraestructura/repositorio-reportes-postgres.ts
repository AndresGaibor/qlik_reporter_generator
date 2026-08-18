import { and, desc, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import {
  configuracionesAutomatizacion,
  ejecucionesReportes,
} from "../../../plataforma/persistencia/esquema.js";
import type {
  ActualizarConfiguracionReportePersistida,
  ConfiguracionReportePersistida,
  CrearConfiguracionReportePersistida,
  CrearEjecucionReportePersistida,
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
  ResumenEjecucionDescarga,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export class RepositorioReportesPostgres implements PuertoRepositorioReportes {
  constructor(private readonly db: ConexionDb) {}

  async crearConfiguracion(
    entrada: CrearConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida> {
    const [fila] = await this.db
      .insert(configuracionesAutomatizacion)
      .values(entrada)
      .returning();
    if (!fila)
      throw new Error("No se pudo persistir la configuración del reporte");
    return mapearConfiguracion(fila);
  }

  async obtenerPorAutomatizacion(
    tenantQlikId: string,
    automatizacionIdQlik: string,
  ): Promise<ConfiguracionReportePersistida | null> {
    const fila = await this.db.query.configuracionesAutomatizacion.findFirst({
      where: and(
        eq(configuracionesAutomatizacion.tenantQlikId, tenantQlikId),
        eq(
          configuracionesAutomatizacion.automatizacionIdQlik,
          automatizacionIdQlik,
        ),
      ),
    });
    return fila ? mapearConfiguracion(fila) : null;
  }

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
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
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
      .set({
        estado: "completada",
        finalizadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, id));
  }

  async obtenerConfiguracionPorId(
    configuracionId: string,
  ): Promise<ConfiguracionReportePersistida | null> {
    const fila = await this.db.query.configuracionesAutomatizacion.findFirst({
      where: eq(configuracionesAutomatizacion.id, configuracionId),
    });
    return fila ? mapearConfiguracion(fila) : null;
  }

  async listarEjecuciones(
    configuracionId: string,
    limite = 50,
  ): Promise<EjecucionReportePersistida[]> {
    const filas = await this.db.query.ejecucionesReportes.findMany({
      where: eq(ejecucionesReportes.configuracionId, configuracionId),
      orderBy: [desc(ejecucionesReportes.creadoEn)],
      limit: Math.min(Math.max(limite, 1), 200),
    });
    return filas.map(mapearEjecucion);
  }

  async marcarEstadoPorRunQlik(
    runIdQlik: string,
    estado: "completada" | "error" | "detenida",
    finalizadoEn: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        estado,
        finalizadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.runIdQlik, runIdQlik));
  }

  async actualizarConfiguracion(
    configuracionId: string,
    cambios: ActualizarConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida> {
    const valores: Partial<typeof configuracionesAutomatizacion.$inferInsert> =
      {
        ...cambios,
        actualizadoEn: new Date(),
      };
    const [actualizada] = await this.db
      .update(configuracionesAutomatizacion)
      .set(valores)
      .where(eq(configuracionesAutomatizacion.id, configuracionId))
      .returning();
    if (!actualizada) throw new Error("No se encontró el reporte a actualizar");
    return mapearConfiguracion(actualizada);
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
    if (!contexto.esAdministrador && !contexto.usuarioId) {
      throw new Error("usuarioId es obligatorio para consultar descargas personales");
    }
    const filas = await this.db
      .select({
        id: ejecucionesReportes.id,
        creadoPorUsuarioId: ejecucionesReportes.creadoPorUsuarioId,
        reporteNombre: configuracionesAutomatizacion.nombre,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .innerJoin(
        configuracionesAutomatizacion,
        eq(
          ejecucionesReportes.configuracionId,
          configuracionesAutomatizacion.id,
        ),
      )
      .where(
        and(
          eq(configuracionesAutomatizacion.tenantQlikId, contexto.tenantQlikId),
          eq(
            configuracionesAutomatizacion.organizacionId,
            contexto.organizacionId,
          ),
          ...(contexto.esAdministrador
            ? []
            : [eq(ejecucionesReportes.creadoPorUsuarioId, contexto.usuarioId!)]),
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
    if (!contexto.esAdministrador && !contexto.usuarioId) {
      throw new Error("usuarioId es obligatorio para consultar una descarga personal");
    }
    const fila = await this.db
      .select({
        id: ejecucionesReportes.id,
        creadoPorUsuarioId: ejecucionesReportes.creadoPorUsuarioId,
        reporteNombre: configuracionesAutomatizacion.nombre,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .innerJoin(
        configuracionesAutomatizacion,
        eq(
          ejecucionesReportes.configuracionId,
          configuracionesAutomatizacion.id,
        ),
      )
      .where(
        and(
          eq(ejecucionesReportes.id, contexto.id),
          eq(configuracionesAutomatizacion.tenantQlikId, contexto.tenantQlikId),
          eq(
            configuracionesAutomatizacion.organizacionId,
            contexto.organizacionId,
          ),
          ...(contexto.esAdministrador
            ? []
            : [eq(ejecucionesReportes.creadoPorUsuarioId, contexto.usuarioId!)]),
        ),
      )
      .limit(1);
    return fila[0] ?? null;
  }
}

function mapearConfiguracion(
  fila: typeof configuracionesAutomatizacion.$inferSelect,
): ConfiguracionReportePersistida {
  if (!fila.automatizacionIdQlik || !fila.automatizacionNombreSnapshot) {
    throw new Error(
      "La configuración del reporte no tiene Qlik Automate asociado",
    );
  }
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    tenantQlikId: fila.tenantQlikId,
    creadoPorUsuarioId: fila.creadoPorUsuarioId,
    nombre: fila.nombre,
    flujoIdQlik: fila.flujoIdQlik,
    flujoNombreSnapshot: fila.flujoNombreSnapshot,
    ...(fila.flujoEspacioIdQlik
      ? { flujoEspacioIdQlik: fila.flujoEspacioIdQlik }
      : {}),
    automatizacionIdQlik: fila.automatizacionIdQlik,
    automatizacionNombreSnapshot: fila.automatizacionNombreSnapshot,
    estado: fila.estado as ConfiguracionReportePersistida["estado"],
  };
}

function mapearEjecucion(
  fila: typeof ejecucionesReportes.$inferSelect,
): EjecucionReportePersistida {
  return {
    id: fila.id,
    configuracionId: fila.configuracionId,
    creadoPorUsuarioId: fila.creadoPorUsuarioId,
    flujoIdQlik: fila.flujoIdQlik,
    automatizacionIdQlik: fila.automatizacionIdQlik,
    hashDataflowSha256: fila.hashDataflowSha256,
    scriptDataflow: fila.scriptDataflow,
    sqlBigQueryCompilado: fila.sqlBigQueryCompilado,
    scriptExportacion: fila.scriptExportacion,
    uriBaseGcs: fila.uriBaseGcs,
    estado: fila.estado as EjecucionReportePersistida["estado"],
    versionCompilador: fila.versionCompilador,
    runIdQlik: fila.runIdQlik,
    etapaError: fila.etapaError,
    mensajeError: fila.mensajeError,
    iniciadoEn: fila.iniciadoEn,
    finalizadoEn: fila.finalizadoEn,
    creadoEn: fila.creadoEn,
  };
}

import { and, desc, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import {
  ejecucionesReportes,
  reportes,
} from "../../../plataforma/persistencia/esquema.js";
import type {
  ActualizarReportePersistido,
  CrearEjecucionReportePersistida,
  CrearReportePersistido,
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
  ReportePersistido,
  ResumenEjecucionDescarga,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export class RepositorioReportesPostgres implements PuertoRepositorioReportes {
  constructor(private readonly db: ConexionDb) {}

  async crearReporte(
    entrada: CrearReportePersistido,
  ): Promise<ReportePersistido> {
    const [fila] = await this.db.insert(reportes).values(entrada).returning();
    if (!fila) throw new Error("No se pudo persistir el reporte");
    return mapearReporte(fila);
  }

  async obtenerPorId(
    reporteId: string,
    tenantQlikId?: string,
    organizacionId?: string,
  ): Promise<ReportePersistido | null> {
    const condiciones = [eq(reportes.id, reporteId)];
    if (tenantQlikId) condiciones.push(eq(reportes.tenantQlikId, tenantQlikId));
    if (organizacionId)
      condiciones.push(eq(reportes.organizacionId, organizacionId));
    const fila = await this.db.query.reportes.findFirst({
      where: and(...condiciones),
    });
    return fila ? mapearReporte(fila) : null;
  }

  async listar(contexto: {
    tenantQlikId: string;
    organizacionId: string;
  }): Promise<ReportePersistido[]> {
    const filas = await this.db.query.reportes.findMany({
      where: and(
        eq(reportes.tenantQlikId, contexto.tenantQlikId),
        eq(reportes.organizacionId, contexto.organizacionId),
      ),
      orderBy: [desc(reportes.creadoEn)],
    });
    return filas.map(mapearReporte);
  }

  async actualizarReporte(
    id: string,
    cambios: ActualizarReportePersistido,
  ): Promise<ReportePersistido> {
    const [fila] = await this.db
      .update(reportes)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(reportes.id, id))
      .returning();
    if (!fila) throw new Error("No se encontró el reporte a actualizar");
    return mapearReporte(fila);
  }

  async clonarReporte(id: string, nombre: string): Promise<ReportePersistido> {
    const origen = await this.obtenerPorId(id);
    if (!origen) throw new Error("No se encontró el reporte a clonar");
    const { id: _id, ...entrada } = origen;
    return this.crearReporte({ ...entrada, nombre });
  }

  async crearEjecucion(
    entrada: CrearEjecucionReportePersistida,
  ): Promise<EjecucionReportePersistida> {
    const { configuracionId, ...resto } = entrada;
    const reporteId = entrada.reporteId ?? configuracionId;
    if (!reporteId) throw new Error("La ejecución requiere un reporte");
    const [fila] = await this.db
      .insert(ejecucionesReportes)
      .values({ ...resto, reporteId })
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
      .set({ estado: "completada", finalizadoEn, actualizadoEn: new Date() })
      .where(eq(ejecucionesReportes.id, id));
  }

  async listarEjecuciones(
    reporteId: string,
    limite = 50,
  ): Promise<EjecucionReportePersistida[]> {
    const filas = await this.db.query.ejecucionesReportes.findMany({
      where: eq(ejecucionesReportes.reporteId, reporteId),
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
      .set({ estado, finalizadoEn, actualizadoEn: new Date() })
      .where(eq(ejecucionesReportes.runIdQlik, runIdQlik));
  }

  async listarEjecucionesDescargas(
    contexto: { tenantQlikId: string; organizacionId: string },
    limite = 100,
  ): Promise<ResumenEjecucionDescarga[]> {
    const filas = await this.db
      .select({
        id: ejecucionesReportes.id,
        reporteNombre: reportes.nombre,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .innerJoin(reportes, eq(ejecucionesReportes.reporteId, reportes.id))
      .where(
        and(
          eq(reportes.tenantQlikId, contexto.tenantQlikId),
          eq(reportes.organizacionId, contexto.organizacionId),
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
  }): Promise<ResumenEjecucionDescarga | null> {
    const [fila] = await this.db
      .select({
        id: ejecucionesReportes.id,
        reporteNombre: reportes.nombre,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
      })
      .from(ejecucionesReportes)
      .innerJoin(reportes, eq(ejecucionesReportes.reporteId, reportes.id))
      .where(
        and(
          eq(ejecucionesReportes.id, contexto.id),
          eq(reportes.tenantQlikId, contexto.tenantQlikId),
          eq(reportes.organizacionId, contexto.organizacionId),
        ),
      )
      .limit(1);
    return fila ?? null;
  }

  async crearConfiguracion(
    entrada: CrearReportePersistido & Record<string, unknown>,
  ): Promise<ReportePersistido> {
    const {
      automatizacionIdQlik: _id,
      automatizacionNombreSnapshot: _nombre,
      ...reporte
    } = entrada;
    return this.crearReporte(reporte);
  }

  async obtenerPorAutomatizacion(
    _tenantQlikId: string,
    _automatizacionIdQlik: string,
  ): Promise<ReportePersistido | null> {
    throw new Error("Los reportes ya no se resuelven por Qlik Automate");
  }

  async obtenerConfiguracionPorId(
    id: string,
  ): Promise<ReportePersistido | null> {
    return this.obtenerPorId(id);
  }
  async actualizarConfiguracion(
    id: string,
    cambios: ActualizarReportePersistido,
  ): Promise<ReportePersistido> {
    return this.actualizarReporte(id, cambios);
  }
}

function mapearReporte(fila: typeof reportes.$inferSelect): ReportePersistido {
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
    estado: fila.estado as ReportePersistido["estado"],
  };
}

function mapearEjecucion(
  fila: typeof ejecucionesReportes.$inferSelect,
): EjecucionReportePersistida {
  return {
    ...fila,
    reporteId: fila.reporteId,
    configuracionId: fila.reporteId,
    ejecutadoPorUsuarioId: fila.ejecutadoPorUsuarioId,
    automatizacionPersonalId: fila.automatizacionPersonalId,
    estado: fila.estado as EjecucionReportePersistida["estado"],
  };
}

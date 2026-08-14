import { and, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import {
  configuracionesAutomatizacion,
  ejecucionesReportes,
} from "../../../plataforma/persistencia/esquema.js";
import type {
  ConfiguracionReportePersistida,
  CrearConfiguracionReportePersistida,
  CrearEjecucionReportePersistida,
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
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
    destinoProveedor: fila.destinoProveedor,
    destinoIdExterno: fila.destinoIdExterno,
    destinoNombreSnapshot: fila.destinoNombreSnapshot,
    automatizacionIdQlik: fila.automatizacionIdQlik,
    automatizacionNombreSnapshot: fila.automatizacionNombreSnapshot,
    programar: fila.programar,
    estado: fila.estado as ConfiguracionReportePersistida["estado"],
    ...(fila.claveIdempotencia
      ? { claveIdempotencia: fila.claveIdempotencia }
      : {}),
  };
}

function mapearEjecucion(
  fila: typeof ejecucionesReportes.$inferSelect,
): EjecucionReportePersistida {
  return {
    id: fila.id,
    configuracionId: fila.configuracionId,
    flujoIdQlik: fila.flujoIdQlik,
    automatizacionIdQlik: fila.automatizacionIdQlik,
    hashDataflowSha256: fila.hashDataflowSha256,
    scriptDataflow: fila.scriptDataflow,
    sqlBigQueryCompilado: fila.sqlBigQueryCompilado,
    scriptExportacion: fila.scriptExportacion,
    uriBaseGcs: fila.uriBaseGcs,
    tipoEjecucion: fila.tipoEjecucion as "manual" | "programada",
    estado: "preparando",
    versionCompilador: fila.versionCompilador,
    runIdQlik: fila.runIdQlik,
    etapaError: fila.etapaError,
    mensajeError: fila.mensajeError,
    iniciadoEn: fila.iniciadoEn,
    finalizadoEn: fila.finalizadoEn,
  };
}

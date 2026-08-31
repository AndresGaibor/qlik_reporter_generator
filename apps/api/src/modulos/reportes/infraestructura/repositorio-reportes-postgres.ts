import { and, desc, eq, inArray, max, or, sql } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import {
  descargasCompartidas,
  ejecucionesReportes,
  jobsBigQueryEjecucion,
  reportesCompartidos,
  usuarios,
} from "../../../plataforma/persistencia/esquema.js";
import type {
  CrearEjecucionReportePersistida,
  EjecucionReportePersistida,
  JobBigQueryPersistido,
  PuertoRepositorioReportes,
  ResumenEjecucionDescarga,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export class RepositorioReportesPostgres implements PuertoRepositorioReportes {
  constructor(private readonly db: ConexionDb) {}

  async obtenerCompartidoReporte(contexto: {
    flujoIdQlik: string;
    organizacionId: string;
    tenantQlikId: string;
  }) {
    const filas = await this.db
      .select({
        alcance: reportesCompartidos.alcance,
        usuarioId: reportesCompartidos.usuarioId,
      })
      .from(reportesCompartidos)
      .where(
        and(
          eq(reportesCompartidos.flujoIdQlik, contexto.flujoIdQlik),
          eq(reportesCompartidos.organizacionId, contexto.organizacionId),
          eq(reportesCompartidos.tenantQlikId, contexto.tenantQlikId),
        ),
      );
    return {
      todaOrganizacion: filas.some((fila) => fila.alcance === "organizacion"),
      usuarios: filas.flatMap((fila) =>
        fila.usuarioId ? [fila.usuarioId] : [],
      ),
    };
  }

  async listarReportesCompartidosParaUsuario(contexto: {
    organizacionId: string;
    tenantQlikId: string;
    usuarioId: string;
  }) {
    const filas = await this.db
      .select({
        flujoIdQlik: reportesCompartidos.flujoIdQlik,
        alcance: reportesCompartidos.alcance,
        usuarioId: reportesCompartidos.usuarioId,
      })
      .from(reportesCompartidos)
      .where(
        and(
          eq(reportesCompartidos.organizacionId, contexto.organizacionId),
          eq(reportesCompartidos.tenantQlikId, contexto.tenantQlikId),
          or(
            eq(reportesCompartidos.alcance, "organizacion"),
            eq(reportesCompartidos.usuarioId, contexto.usuarioId),
          ),
        ),
      );
    const resultado = new Map<
      string,
      { directo: boolean; todaOrganizacion: boolean }
    >();
    for (const fila of filas) {
      const actual = resultado.get(fila.flujoIdQlik) ?? {
        directo: false,
        todaOrganizacion: false,
      };
      if (fila.alcance === "organizacion") actual.todaOrganizacion = true;
      if (fila.usuarioId === contexto.usuarioId) actual.directo = true;
      resultado.set(fila.flujoIdQlik, actual);
    }
    return resultado;
  }

  async guardarCompartidoReporte(entrada: {
    flujoIdQlik: string;
    organizacionId: string;
    tenantQlikId: string;
    creadoPorUsuarioId: string;
    todaOrganizacion: boolean;
    usuarios: string[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const alcance = and(
        eq(reportesCompartidos.flujoIdQlik, entrada.flujoIdQlik),
        eq(reportesCompartidos.organizacionId, entrada.organizacionId),
        eq(reportesCompartidos.tenantQlikId, entrada.tenantQlikId),
      );
      await tx.delete(reportesCompartidos).where(alcance);
      const base = {
        flujoIdQlik: entrada.flujoIdQlik,
        organizacionId: entrada.organizacionId,
        tenantQlikId: entrada.tenantQlikId,
        creadoPorUsuarioId: entrada.creadoPorUsuarioId,
      };
      const valores = entrada.todaOrganizacion
        ? [{ ...base, alcance: "organizacion" }]
        : [...new Set(entrada.usuarios)].map((usuarioId) => ({
            ...base,
            usuarioId,
            alcance: "usuario",
          }));
      if (valores.length) await tx.insert(reportesCompartidos).values(valores);
    });
  }

  async obtenerCompartidoDescarga(ejecucionId: string) {
    const filas = await this.db
      .select({
        alcance: descargasCompartidas.alcance,
        usuarioId: descargasCompartidas.usuarioId,
      })
      .from(descargasCompartidas)
      .where(eq(descargasCompartidas.ejecucionReporteId, ejecucionId));
    return {
      todaOrganizacion: filas.some((fila) => fila.alcance === "organizacion"),
      usuarios: filas.flatMap((fila) =>
        fila.usuarioId ? [fila.usuarioId] : [],
      ),
    };
  }

  async guardarCompartidoDescarga(entrada: {
    ejecucionId: string;
    organizacionId: string;
    creadoPorUsuarioId: string;
    todaOrganizacion: boolean;
    usuarios: string[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(descargasCompartidas)
        .where(
          eq(descargasCompartidas.ejecucionReporteId, entrada.ejecucionId),
        );
      const valores = entrada.todaOrganizacion
        ? [
            {
              ejecucionReporteId: entrada.ejecucionId,
              organizacionId: entrada.organizacionId,
              creadoPorUsuarioId: entrada.creadoPorUsuarioId,
              alcance: "organizacion",
            },
          ]
        : [...new Set(entrada.usuarios)].map((usuarioId) => ({
            ejecucionReporteId: entrada.ejecucionId,
            organizacionId: entrada.organizacionId,
            creadoPorUsuarioId: entrada.creadoPorUsuarioId,
            usuarioId,
            alcance: "usuario",
          }));
      if (valores.length) await tx.insert(descargasCompartidas).values(valores);
    });
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

  async tieneEjecucionesActivasPorAutomatizacion(
    automatizacionIdQlik: string,
  ): Promise<boolean> {
    const fila = await this.db.query.ejecucionesReportes.findFirst({
      columns: { id: true },
      where: and(
        eq(ejecucionesReportes.automatizacionIdQlik, automatizacionIdQlik),
        inArray(ejecucionesReportes.estado, [
          "preparando",
          "iniciada",
          "cancelando",
        ]),
      ),
    });
    return Boolean(fila);
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

  async marcarCancelacionSolicitada(
    ejecucionId: string,
    usuarioId: string,
    fecha: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        estado: "cancelando",
        cancelacionSolicitadaEn: fecha,
        canceladaPorUsuarioId: usuarioId,
        motivoDetencion: "usuario",
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, ejecucionId));
  }

  async marcarEjecucionDetenida(
    ejecucionId: string,
    fecha: Date,
  ): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        estado: "detenida",
        finalizadoEn: fecha,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, ejecucionId));
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

  async listarUltimasEjecucionesPorFlujo(
    tenantQlikId: string,
    organizacionId: string,
  ): Promise<Array<{ flujoIdQlik: string; ultimaEjecucionEn: Date }>> {
    const filas = await this.db
      .select({
        flujoIdQlik: ejecucionesReportes.flujoIdQlik,
        ultimaEjecucionEn: max(ejecucionesReportes.creadoEn),
      })
      .from(ejecucionesReportes)
      .where(
        and(
          eq(ejecucionesReportes.tenantQlikId, tenantQlikId),
          eq(ejecucionesReportes.organizacionId, organizacionId),
        ),
      )
      .groupBy(ejecucionesReportes.flujoIdQlik);

    return filas.flatMap((fila) =>
      fila.ultimaEjecucionEn
        ? [
            {
              flujoIdQlik: fila.flujoIdQlik,
              ultimaEjecucionEn: fila.ultimaEjecucionEn,
            },
          ]
        : [],
    );
  }

  async marcarEstadoEjecucion(
    id: string,
    estado: "completada" | "error" | "detenida" | "cancelando",
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
        propietarioCorreo: usuarios.correo,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        iniciadoEn: ejecucionesReportes.iniciadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
        runIdQlik: ejecucionesReportes.runIdQlik,
        jobIdBigQuery: ejecucionesReportes.jobIdPrincipalBigQuery,
        bigqueryProjectId: ejecucionesReportes.bigqueryProjectId,
        bigqueryLocation: ejecucionesReportes.bigqueryLocation,
        bigqueryIniciadoEn: ejecucionesReportes.bigqueryIniciadoEn,
        bigqueryFinalizadoEn: ejecucionesReportes.bigqueryFinalizadoEn,
      })
      .from(ejecucionesReportes)
      .leftJoin(
        usuarios,
        eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarios.id),
      )
      .where(
        and(
          eq(ejecucionesReportes.tenantQlikId, contexto.tenantQlikId),
          eq(ejecucionesReportes.organizacionId, contexto.organizacionId),
          ...(usuarioId
            ? [
                or(
                  eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarioId),
                  sql`exists (select 1 from ${descargasCompartidas} dc where dc.ejecucion_reporte_id = ${ejecucionesReportes.id} and dc.organizacion_id = ${contexto.organizacionId} and (dc.alcance = 'organizacion' or dc.usuario_id = ${usuarioId}))`,
                ),
              ]
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
        propietarioCorreo: usuarios.correo,
        automatizacionIdQlik: ejecucionesReportes.automatizacionIdQlik,
        estado: ejecucionesReportes.estado,
        mensajeError: ejecucionesReportes.mensajeError,
        uriBaseGcs: ejecucionesReportes.uriBaseGcs,
        creadoEn: ejecucionesReportes.creadoEn,
        finalizadoEn: ejecucionesReportes.finalizadoEn,
        runIdQlik: ejecucionesReportes.runIdQlik,
        jobIdBigQuery: ejecucionesReportes.jobIdPrincipalBigQuery,
        bigqueryProjectId: ejecucionesReportes.bigqueryProjectId,
        bigqueryLocation: ejecucionesReportes.bigqueryLocation,
        bigqueryIniciadoEn: ejecucionesReportes.bigqueryIniciadoEn,
        bigqueryFinalizadoEn: ejecucionesReportes.bigqueryFinalizadoEn,
      })
      .from(ejecucionesReportes)
      .leftJoin(
        usuarios,
        eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarios.id),
      )
      .where(
        and(
          eq(ejecucionesReportes.id, contexto.id),
          eq(ejecucionesReportes.tenantQlikId, contexto.tenantQlikId),
          eq(ejecucionesReportes.organizacionId, contexto.organizacionId),
          ...(usuarioId
            ? [
                or(
                  eq(ejecucionesReportes.ejecutadoPorUsuarioId, usuarioId),
                  sql`exists (select 1 from ${descargasCompartidas} dc where dc.ejecucion_reporte_id = ${ejecucionesReportes.id} and dc.organizacion_id = ${contexto.organizacionId} and (dc.alcance = 'organizacion' or dc.usuario_id = ${usuarioId}))`,
                ),
              ]
            : []),
        ),
      )
      .limit(1);
    return fila ?? null;
  }

  async obtenerEjecucionPorJobId(
    jobId: string,
  ): Promise<EjecucionReportePersistida | null> {
    const [fila] = await this.db
      .select()
      .from(ejecucionesReportes)
      .where(eq(ejecucionesReportes.jobIdPrincipalBigQuery, jobId))
      .limit(1);
    return fila ? mapearEjecucion(fila) : null;
  }

  async obtenerEjecucionPorId(
    id: string,
  ): Promise<EjecucionReportePersistida | null> {
    const [fila] = await this.db
      .select()
      .from(ejecucionesReportes)
      .where(eq(ejecucionesReportes.id, id))
      .limit(1);
    return fila ? mapearEjecucion(fila) : null;
  }

  async guardarJobBigQueryEjecucion(job: JobBigQueryPersistido): Promise<void> {
    const locationNormalizada = job.location ?? "US";
    await this.db
      .insert(jobsBigQueryEjecucion)
      .values({
        ...(job.id ? { id: job.id } : {}),
        ejecucionReporteId: job.ejecucionReporteId,
        jobId: job.jobId,
        parentJobId: job.parentJobId,
        projectId: job.projectId,
        location: locationNormalizada,
        tipo: job.tipo,
        estado: job.estado,
        creationTime: job.creationTime ? new Date(job.creationTime) : null,
        startTime: job.startTime ? new Date(job.startTime) : null,
        endTime: job.endTime ? new Date(job.endTime) : null,
        duracionMs: job.duracionMs,
        totalBytesProcessed: job.totalBytesProcessed,
        totalBytesBilled: job.totalBytesBilled,
        totalSlotMs: job.totalSlotMs,
        cacheHit: job.cacheHit,
        statementType: job.statementType,
        errorReason: job.errorReason,
        errorMessage: job.errorMessage,
        metadataJson: job.metadataJson,
      })
      .onConflictDoUpdate({
        target: [
          jobsBigQueryEjecucion.projectId,
          jobsBigQueryEjecucion.location,
          jobsBigQueryEjecucion.jobId,
        ],
        set: {
          parentJobId: job.parentJobId,
          tipo: job.tipo,
          estado: job.estado,
          creationTime: job.creationTime ? new Date(job.creationTime) : null,
          startTime: job.startTime ? new Date(job.startTime) : null,
          endTime: job.endTime ? new Date(job.endTime) : null,
          duracionMs: job.duracionMs,
          totalBytesProcessed: job.totalBytesProcessed,
          totalBytesBilled: job.totalBytesBilled,
          totalSlotMs: job.totalSlotMs,
          cacheHit: job.cacheHit,
          statementType: job.statementType,
          errorReason: job.errorReason,
          errorMessage: job.errorMessage,
          metadataJson: job.metadataJson,
          actualizadoEn: new Date(),
        },
      });
  }

  async listarJobsBigQueryPorEjecucion(
    ejecucionId: string,
  ): Promise<JobBigQueryPersistido[]> {
    const filas = await this.db
      .select()
      .from(jobsBigQueryEjecucion)
      .where(eq(jobsBigQueryEjecucion.ejecucionReporteId, ejecucionId))
      .orderBy(jobsBigQueryEjecucion.creationTime);
    return filas.map(mapearJobBigQuery);
  }

  async listarJobsBigQueryPorEjecucionIds(
    ejecucionIds: string[],
  ): Promise<Map<string, JobBigQueryPersistido[]>> {
    if (ejecucionIds.length === 0) {
      return new Map();
    }
    const filas = await this.db
      .select()
      .from(jobsBigQueryEjecucion)
      .where(inArray(jobsBigQueryEjecucion.ejecucionReporteId, ejecucionIds))
      .orderBy(jobsBigQueryEjecucion.creationTime);
    const map = new Map<string, JobBigQueryPersistido[]>();
    for (const fila of filas) {
      const jobs = map.get(fila.ejecucionReporteId) ?? [];
      jobs.push(mapearJobBigQuery(fila));
      map.set(fila.ejecucionReporteId, jobs);
    }
    return map;
  }

  async actualizarTimestampsEjecucionBigQuery(
    ejecucionId: string,
    timestamps: {
      bigqueryIniciadoEn?: Date | null;
      bigqueryFinalizadoEn?: Date | null;
    },
  ): Promise<void> {
    const set: Record<string, unknown> = { actualizadoEn: new Date() };
    if (timestamps.bigqueryIniciadoEn !== undefined) {
      set.bigqueryIniciadoEn = timestamps.bigqueryIniciadoEn;
    }
    if (timestamps.bigqueryFinalizadoEn !== undefined) {
      set.bigqueryFinalizadoEn = timestamps.bigqueryFinalizadoEn;
    }
    await this.db
      .update(ejecucionesReportes)
      .set(set)
      .where(eq(ejecucionesReportes.id, ejecucionId));
  }

  async marcarGcsFinalizada(id: string, gcsFinalizadoEn: Date): Promise<void> {
    await this.db
      .update(ejecucionesReportes)
      .set({
        gcsFinalizadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(ejecucionesReportes.id, id));
  }
}

function mapearEjecucion(
  fila: typeof ejecucionesReportes.$inferSelect,
): EjecucionReportePersistida {
  return {
    ...fila,
    ejecutadoPorUsuarioId: fila.ejecutadoPorUsuarioId,
    automatizacionPersonalId: fila.automatizacionPersonalId,
    origenEjecucion: (fila.origenEjecucion ??
      "legacy") as EjecucionReportePersistida["origenEjecucion"],
    estado: fila.estado as EjecucionReportePersistida["estado"],
  };
}

function mapearJobBigQuery(
  fila: typeof jobsBigQueryEjecucion.$inferSelect,
): JobBigQueryPersistido {
  return {
    id: fila.id,
    ejecucionReporteId: fila.ejecucionReporteId,
    jobId: fila.jobId,
    parentJobId: fila.parentJobId,
    projectId: fila.projectId,
    location: fila.location ?? "US",
    tipo: fila.tipo as JobBigQueryPersistido["tipo"],
    estado: fila.estado as JobBigQueryPersistido["estado"],
    creationTime: fila.creationTime?.toISOString() ?? null,
    startTime: fila.startTime?.toISOString() ?? null,
    endTime: fila.endTime?.toISOString() ?? null,
    duracionMs: fila.duracionMs,
    totalBytesProcessed: fila.totalBytesProcessed,
    totalBytesBilled: fila.totalBytesBilled,
    totalSlotMs: fila.totalSlotMs,
    cacheHit: fila.cacheHit,
    statementType: fila.statementType,
    errorReason: fila.errorReason,
    errorMessage: fila.errorMessage,
    metadataJson: fila.metadataJson as Record<string, unknown> | null,
  };
}

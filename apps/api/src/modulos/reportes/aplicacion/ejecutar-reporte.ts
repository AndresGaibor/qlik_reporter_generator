import {
  ErrorAplicacion,
  ErrorConflicto,
} from "../../../nucleo/errores/error-aplicacion.js";
import { generarUuid } from "../../../nucleo/valores/generar-uuid.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import {
  construirConsultasTalendBigQuery,
  serializarConsultasTalend,
} from "./consultas-talend-bigquery.js";
import type {
  ContextoObtenerOCrearAutomatizacionPersonal,
  ObtenerOCrearAutomatizacionPersonal,
} from "./obtener-o-crear-automatizacion-personal.js";
import {
  type AlcanceBigQueryReporte,
  prepararDataflowActual,
} from "./preflight-dataflow.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";
import { inyectarContextoTalend } from "./servicio-contexto-talend.js";
const VERSION_COMPILADOR = 2;

export interface EntradaEjecutarReporte {
  tenantId: string;
  organizacionId: string;
  flujoIdQlik: string;
  usuarioId: string;
  usuarioIdQlik: string;
  correo?: string | null;
}

export type ResolverContextoWorker = (
  entrada: EntradaEjecutarReporte,
  flujo: { id: string; name: string; spaceId?: string | null },
) => ContextoObtenerOCrearAutomatizacionPersonal;

export class EjecutarReporte {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioReportes,
    private readonly bloqueos: PuertoBloqueoEjecucion,
    private readonly alcanceBigQuery: AlcanceBigQueryReporte,
    private readonly generarId: () => string = generarUuid,
    private readonly resolverContextoWorker: ResolverContextoWorker = () => {
      throw new ErrorAplicacion(
        "WORKER_CONTEXT_NOT_CONFIGURED",
        "El contexto del worker personal debe ser configurado por el servidor",
        500,
      );
    },
    private readonly workers?: Pick<
      ObtenerOCrearAutomatizacionPersonal,
      "ejecutar"
    >,
  ) {}

  async ejecutar(
    entrada: EntradaEjecutarReporte,
  ): Promise<{ runId: string; ejecucionReporteId: string }> {
    const flujo = (await this.qlik.listarFlujos()).find(
      (item) => item.id === entrada.flujoIdQlik,
    );
    if (!flujo)
      throw new ErrorAplicacion(
        "DATAFLOW_NO_ENCONTRADO",
        "El Dataflow no está disponible en el tenant",
        404,
      );

    const preparacion = await prepararDataflowActual(
      this.qlik,
      flujo.id,
      this.alcanceBigQuery,
    );
    if (!preparacion.compatible) {
      throw new ErrorAplicacion(
        "DATAFLOW_NO_COMPATIBLE",
        "El Dataflow actual contiene operaciones no soportadas; no se inició Talend",
        422,
        { operacionesNoSoportadas: preparacion.operacionesNoSoportadas },
      );
    }
    if (!this.alcanceBigQuery.credencialesJson?.trim()) {
      throw new ErrorAplicacion(
        "BIGQUERY_CREDENCIALES_NO_CONFIGURADAS",
        "La conexión BigQuery del tenant no tiene credenciales JSON configuradas",
        422,
      );
    }
    if (!this.alcanceBigQuery.estimador) {
      throw new ErrorAplicacion(
        "BIGQUERY_ESTIMADOR_NO_CONFIGURADO",
        "No se pudo validar BigQuery antes de iniciar Talend",
        500,
      );
    }
    await this.alcanceBigQuery.estimador.estimarConsulta(
      preparacion.sqlBigQuery,
    );

    const workers = this.workers;
    if (!workers) {
      throw new ErrorAplicacion(
        "WORKER_NOT_CONFIGURED",
        "El worker personal no está configurado",
        500,
      );
    }
    const worker = await workers.ejecutar(
      this.resolverContextoWorker(entrada, flujo),
    );
    const resultado = await this.crearAuditoriaYEjecutar(
      entrada,
      flujo,
      worker,
      preparacion,
    );
    if (!resultado) {
      throw new ErrorConflicto("Ejecución en conflicto: el lock está ocupado");
    }
    return resultado;
  }

  private async crearAuditoriaYEjecutar(
    entrada: EntradaEjecutarReporte,
    flujo: { id: string; name: string; spaceId?: string | null },
    worker: Awaited<
      ReturnType<
        NonNullable<
          Pick<ObtenerOCrearAutomatizacionPersonal, "ejecutar">
        >["ejecutar"]
      >
    >,
    preparacion: Awaited<ReturnType<typeof prepararDataflowActual>>,
  ): Promise<{ runId: string; ejecucionReporteId: string }> {
    const ejecucionReporteId = this.generarId();
    const uriBaseGcs = construirUriEjecucion(
      this.alcanceBigQuery.gcsUri ?? "gs://bkt_dwh/POCs/TalendDescargados/",
      flujo.name,
      ejecucionReporteId,
      entrada.correo,
      entrada.usuarioId,
    );
    const consultasTalend = construirConsultasTalendBigQuery({
      sql: preparacion.sqlBigQuery,
      uriBase: uriBaseGcs,
      projectId: this.alcanceBigQuery.projectId,
      dataset: this.alcanceBigQuery.dataset,
      ejecucionId: ejecucionReporteId,
    });
    const scriptExportacion = serializarConsultasTalend(consultasTalend);

    let auditoriaCreada = false;
    let etapa = "auditoria";
    let runIdQlik: string | undefined;
    try {
      await this.repositorio.crearEjecucion({
        id: ejecucionReporteId,
        organizacionId: entrada.organizacionId,
        tenantQlikId: entrada.tenantId,
        ejecutadoPorUsuarioId: entrada.usuarioId,
        automatizacionPersonalId: worker.id,
        flujoIdQlik: flujo.id,
        flujoNombreSnapshot: flujo.name,
        flujoEspacioIdQlik: flujo.spaceId ?? null,
        automatizacionIdQlik: worker.automatizacionIdQlik,
        hashDataflowSha256: preparacion.hashDataflowSha256,
        scriptDataflow: preparacion.scriptDataflow,
        sqlBigQueryCompilado: preparacion.sqlBigQuery,
        scriptExportacion,
        uriBaseGcs,
        estado: "preparando",
        versionCompilador: VERSION_COMPILADOR,
      });
      auditoriaCreada = true;

      const resultado = await this.bloqueos.ejecutarExclusivo(
        `${entrada.tenantId}:${worker.automatizacionIdQlik}`,
        async () => {
          etapa = "obtener-workspace";
          const automatizacion = await this.qlik.obtenerAutomatizacion(
            worker.automatizacionIdQlik,
          );
          const workspace = inyectarContextoTalend(
            (automatizacion.workspace ?? {}) as Record<string, unknown>,
            consultasTalend,
          );
          etapa = "actualizar-workspace";
          await this.qlik.actualizarAutomatizacion(
            worker.automatizacionIdQlik,
            {
              name: automatizacion.name,
              schedules: [],
              workspace,
              description: automatizacion.description ?? "",
              maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
            },
          );

          etapa = "crear-run";
          return this.qlik.ejecutarAutomatizacion(worker.automatizacionIdQlik);
        },
      );
      if (!resultado) {
        etapa = "lock";
        throw new ErrorConflicto(
          "Ejecución en conflicto: el lock está ocupado",
        );
      }
      runIdQlik = resultado.runId;
      etapa = "persistir-run";
      await this.repositorio.marcarEjecucionIniciada(
        ejecucionReporteId,
        runIdQlik,
        new Date(),
      );
      return { runId: runIdQlik, ejecucionReporteId };
    } catch (error) {
      if (auditoriaCreada) {
        const mensaje =
          error instanceof Error ? error.message : "Error desconocido";
        await this.repositorio
          .marcarEjecucionError(
            ejecucionReporteId,
            etapa,
            mensaje,
            new Date(),
            runIdQlik,
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }
}

function construirUriEjecucion(
  uriBase: string,
  nombreReporte: string,
  ejecucionId: string,
  correo?: string | null,
  usuarioId?: string,
): string {
  const segmento =
    nombreReporte
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "reporte";
  const base = uriBase.trim().replace(/\/+$/, "");
  if (!base.startsWith("gs://")) {
    throw new Error("La ruta GCS debe iniciar con gs://");
  }
  const nombreCorreo = (correo?.split("@", 1)[0] ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
  const propietario =
    nombreCorreo ||
    (usuarioId ?? "usuario")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 80) ||
    "usuario";
  return `${base}/${propietario}/${segmento}/${ejecucionId}/`;
}

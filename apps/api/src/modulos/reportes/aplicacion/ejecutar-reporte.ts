import {
  ErrorAplicacion,
  ErrorConflicto,
  ErrorNoEncontrado,
} from "../../../nucleo/errores/error-aplicacion.js";
import { generarUuid } from "../../../nucleo/valores/generar-uuid.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { URI_BASE_GCS_REPORTES } from "../dominio/destino-gcs.js";
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
  reporteId: string;
  usuarioId: string;
  usuarioIdQlik: string;
}

export type ResolverContextoWorker = (
  entrada: EntradaEjecutarReporte,
  reporte: Awaited<ReturnType<PuertoRepositorioReportes["obtenerPorId"]>> &
    object,
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
    const reporte = await this.repositorio.obtenerPorId(
      entrada.reporteId,
      entrada.tenantId,
      entrada.organizacionId,
    );
    if (!reporte) {
      throw new ErrorNoEncontrado(
        "El reporte no existe dentro del tenant y organización solicitados",
      );
    }
    if (reporte.estado !== "activa") {
      throw new ErrorConflicto(
        `El reporte no puede ejecutarse mientras está ${reporte.estado}`,
      );
    }

    const preparacion = await prepararDataflowActual(
      this.qlik,
      reporte.flujoIdQlik,
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

    const workers = this.workers;
    if (!workers) {
      throw new ErrorAplicacion(
        "WORKER_NOT_CONFIGURED",
        "El worker personal no está configurado",
        500,
      );
    }
    const worker = await workers.ejecutar(
      this.resolverContextoWorker(entrada, reporte),
    );
    const resultado = await this.crearAuditoriaYEjecutar(
      entrada,
      reporte,
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
    configuracion: NonNullable<
      Awaited<ReturnType<PuertoRepositorioReportes["obtenerPorId"]>>
    >,
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
      configuracion.nombre,
      ejecucionReporteId,
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
    let errorMarcado = false;
    let etapa = "auditoria";
    try {
      await this.repositorio.crearEjecucion({
        id: ejecucionReporteId,
        reporteId: configuracion.id,
        ejecutadoPorUsuarioId: entrada.usuarioId,
        automatizacionPersonalId: worker.id,
        flujoIdQlik: configuracion.flujoIdQlik,
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
          etapa = "actualizar-automate";
          const automatizacion = await this.qlik.obtenerAutomatizacion(
            worker.automatizacionIdQlik,
          );
          const workspace = inyectarContextoTalend(
            (automatizacion.workspace ?? {}) as Record<string, unknown>,
            consultasTalend,
          );
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

          etapa = "ejecutar-automate";
          return this.qlik.ejecutarAutomatizacion(worker.automatizacionIdQlik);
        },
      );
      if (!resultado) {
        await this.repositorio.marcarEjecucionError(
          ejecucionReporteId,
          "lock",
          "El lock del worker personal está ocupado; no se modificó el workspace ni se creó un run",
          new Date(),
        );
        errorMarcado = true;
        throw new ErrorConflicto(
          "Ejecución en conflicto: el lock está ocupado",
        );
      }
      const { runId } = resultado;
      await this.repositorio.marcarEjecucionIniciada(
        ejecucionReporteId,
        runId,
        new Date(),
      );
      return { runId, ejecucionReporteId };
    } catch (error) {
      if (auditoriaCreada && !errorMarcado) {
        const mensaje =
          error instanceof Error ? error.message : "Error desconocido";
        await this.repositorio
          .marcarEjecucionError(ejecucionReporteId, etapa, mensaje, new Date())
          .catch(() => undefined);
      }
      throw error;
    }
  }
}

function construirUriEjecucion(
  nombreReporte: string,
  ejecucionId: string,
): string {
  const segmento =
    nombreReporte
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "reporte";
  return `${URI_BASE_GCS_REPORTES}${segmento}/${ejecucionId}/`;
}

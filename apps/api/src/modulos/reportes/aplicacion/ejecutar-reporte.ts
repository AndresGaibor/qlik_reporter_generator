import {
  ErrorAplicacion,
  ErrorConflicto,
  ErrorNoEncontrado,
} from "../../../nucleo/errores/error-aplicacion.js";
import { generarUuid } from "../../../nucleo/valores/generar-uuid.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import { estaEjecucionEnCurso } from "../../automatizaciones/dominio/estado-ejecucion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { URI_BASE_GCS_REPORTES } from "../dominio/destino-gcs.js";
import {
  construirConsultasTalendBigQuery,
  serializarConsultasTalend,
} from "./consultas-talend-bigquery.js";
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
  automatizacionIdQlik: string;
  usuarioId?: string;
}

export class EjecutarReporte {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioReportes,
    private readonly bloqueos: PuertoBloqueoEjecucion,
    private readonly alcanceBigQuery: AlcanceBigQueryReporte,
    private readonly generarId: () => string = generarUuid,
  ) {}

  async ejecutar(
    entrada: EntradaEjecutarReporte,
  ): Promise<{ runId: string; ejecucionReporteId: string }> {
    const resultado = await this.bloqueos.ejecutarExclusivo(
      `${entrada.tenantId}:${entrada.automatizacionIdQlik}`,
      () => this.ejecutarBajoBloqueo(entrada),
    );
    if (!resultado) {
      throw new ErrorConflicto("Ya existe una solicitud de ejecución en curso");
    }
    return resultado;
  }

  private async ejecutarBajoBloqueo(
    entrada: EntradaEjecutarReporte,
  ): Promise<{ runId: string; ejecucionReporteId: string }> {
    const configuracion = await this.repositorio.obtenerPorAutomatizacion(
      entrada.tenantId,
      entrada.automatizacionIdQlik,
    );
    if (!configuracion) {
      throw new ErrorNoEncontrado(
        "La automatización no está asociada a un reporte Dataflow de esta plataforma",
      );
    }
    if (configuracion.organizacionId !== entrada.organizacionId) {
      throw new ErrorNoEncontrado(
        "El reporte no pertenece a la organización activa",
      );
    }
    if (configuracion.estado !== "activa") {
      throw new ErrorConflicto(
        `El reporte no puede ejecutarse mientras está ${configuracion.estado}`,
      );
    }

    const [ultima] = await this.qlik.listarEjecuciones(
      entrada.automatizacionIdQlik,
      { limit: 1, sort: "desc" },
    );
    if (ultima && estaEjecucionEnCurso(ultima.status)) {
      throw new ErrorConflicto(
        `La automatización ya tiene una ejecución en estado ${ultima.status}`,
        { ejecucionId: ultima.id },
      );
    }

    const preparacion = await prepararDataflowActual(
      this.qlik,
      configuracion.flujoIdQlik,
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
    let etapa = "auditoria";
    try {
      await this.repositorio.crearEjecucion({
        id: ejecucionReporteId,
        configuracionId: configuracion.id,
        flujoIdQlik: configuracion.flujoIdQlik,
        automatizacionIdQlik: entrada.automatizacionIdQlik,
        hashDataflowSha256: preparacion.hashDataflowSha256,
        scriptDataflow: preparacion.scriptDataflow,
        sqlBigQueryCompilado: preparacion.sqlBigQuery,
        scriptExportacion,
        uriBaseGcs,
        tipoEjecucion: "manual",
        estado: "preparando",
        versionCompilador: VERSION_COMPILADOR,
      });
      auditoriaCreada = true;

      etapa = "actualizar-automate";
      const automatizacion = await this.qlik.obtenerAutomatizacion(
        entrada.automatizacionIdQlik,
      );
      const workspace = inyectarContextoTalend(
        (automatizacion.workspace ?? {}) as Record<string, unknown>,
        consultasTalend,
      );
      await this.qlik.actualizarAutomatizacion(entrada.automatizacionIdQlik, {
        name: automatizacion.name,
        schedules: [],
        workspace,
        description: automatizacion.description ?? "",
        maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
      });

      etapa = "ejecutar-automate";
      const { runId } = await this.qlik.ejecutarAutomatizacion(
        entrada.automatizacionIdQlik,
      );
      await this.repositorio.marcarEjecucionIniciada(
        ejecucionReporteId,
        runId,
        new Date(),
      );
      return { runId, ejecucionReporteId };
    } catch (error) {
      if (auditoriaCreada) {
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

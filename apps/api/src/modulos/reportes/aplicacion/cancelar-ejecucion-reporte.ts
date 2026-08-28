import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { PuertoJobsBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";

export interface EntradaCancelarEjecucionReporte {
  ejecucionId: string;
  flujoIdQlik: string;
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  esAdministrador: boolean;
}

export class CancelarEjecucionReporte {
  constructor(
    private readonly repositorio: PuertoRepositorioReportes,
    private readonly qlik: PuertoQlik,
    private readonly jobsBigQuery?: PuertoJobsBigQuery,
  ) {}

  async ejecutar(
    entrada: EntradaCancelarEjecucionReporte,
  ): Promise<{ estado: string }> {
    const ejecucion = await this.repositorio.obtenerEjecucionPorId(
      entrada.ejecucionId,
    );
    if (
      !ejecucion ||
      ejecucion.flujoIdQlik !== entrada.flujoIdQlik ||
      ejecucion.tenantQlikId !== entrada.tenantId ||
      ejecucion.organizacionId !== entrada.organizacionId
    ) {
      throw new ErrorAplicacion(
        "EJECUCION_NO_ENCONTRADA",
        "La ejecución no existe",
        404,
      );
    }
    if (
      ejecucion.ejecutadoPorUsuarioId !== entrada.usuarioId &&
      !entrada.esAdministrador
    ) {
      throw new ErrorAplicacion(
        "EJECUCION_SIN_PERMISO",
        "No tienes permiso para cancelar esta ejecución",
        403,
      );
    }
    if (["completada", "error", "detenida"].includes(ejecucion.estado)) {
      return { estado: ejecucion.estado };
    }
    if (ejecucion.estado !== "cancelando") {
      await this.repositorio.marcarCancelacionSolicitada(
        ejecucion.id,
        entrada.usuarioId,
        new Date(),
      );
    }
    await Promise.allSettled([
      ejecucion.runIdQlik
        ? this.qlik.detenerEjecucion(
            ejecucion.automatizacionIdQlik,
            ejecucion.runIdQlik,
          )
        : Promise.resolve(),
      ejecucion.jobIdPrincipalBigQuery &&
      ejecucion.bigqueryProjectId &&
      this.jobsBigQuery
        ? this.jobsBigQuery.cancelarJob({
            projectId: ejecucion.bigqueryProjectId,
            jobId: ejecucion.jobIdPrincipalBigQuery,
            location: ejecucion.bigqueryLocation ?? undefined,
          })
        : Promise.resolve(),
    ]);
    return { estado: "cancelando" };
  }
}

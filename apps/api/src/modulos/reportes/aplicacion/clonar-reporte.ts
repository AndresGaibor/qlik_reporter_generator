import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { ContextoReporte } from "./crear-reporte.js";
import type {
  PuertoRepositorioReportes,
  ReportePersistido,
} from "./puertos/puerto-repositorio-reportes.js";

export class ClonarReporte {
  constructor(
    private readonly reportes: Pick<
      PuertoRepositorioReportes,
      "obtenerPorId" | "crearReporte"
    >,
  ) {}

  async ejecutar(
    reporteId: string,
    nombre: string,
    contexto: ContextoReporte,
  ): Promise<ReportePersistido> {
    const origen = await this.reportes.obtenerPorId(
      reporteId,
      contexto.tenantId,
      contexto.organizacionId,
    );
    if (!origen) {
      throw new ErrorAplicacion(
        "REPORTE_NO_ENCONTRADO",
        "Reporte no encontrado",
        404,
      );
    }

    return this.reportes.crearReporte({
      organizacionId: contexto.organizacionId,
      tenantQlikId: contexto.tenantId,
      creadoPorUsuarioId: contexto.usuarioId,
      nombre,
      flujoIdQlik: origen.flujoIdQlik,
      flujoNombreSnapshot: origen.flujoNombreSnapshot,
      ...(origen.flujoEspacioIdQlik
        ? { flujoEspacioIdQlik: origen.flujoEspacioIdQlik }
        : {}),
      estado: "activa",
    });
  }
}

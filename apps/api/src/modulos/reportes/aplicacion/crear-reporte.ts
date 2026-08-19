import type { PreflightDataflowReporte } from "@qlik/contratos";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type {
  PuertoRepositorioReportes,
  ReportePersistido,
} from "./puertos/puerto-repositorio-reportes.js";

export interface EntradaCrearReporte {
  nombre: string;
  flujoIdQlik: string;
  espacioIdQlik?: string;
}

export interface ContextoReporte {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
}

export interface PuertoPreflightReporte {
  ejecutar(
    flujoIdQlik: string,
  ): Promise<Pick<PreflightDataflowReporte, "compatible">>;
}

export class CrearReporte {
  constructor(
    private readonly qlik: Pick<PuertoQlik, "listarFlujos">,
    private readonly preflight: PuertoPreflightReporte,
    private readonly reportes: Pick<PuertoRepositorioReportes, "crearReporte">,
  ) {}

  async ejecutar(
    entrada: EntradaCrearReporte,
    contexto: ContextoReporte,
  ): Promise<ReportePersistido> {
    const validacion = await this.preflight.ejecutar(entrada.flujoIdQlik);
    if (!validacion.compatible) {
      throw new ErrorAplicacion(
        "DATAFLOW_NO_COMPATIBLE",
        "El Dataflow contiene operaciones no soportadas",
        422,
      );
    }

    const flujo = (await this.qlik.listarFlujos(entrada.espacioIdQlik)).find(
      (item) => item.id === entrada.flujoIdQlik,
    );
    if (!flujo) {
      throw new ErrorAplicacion(
        "DATAFLOW_NO_ENCONTRADO",
        "El Dataflow seleccionado ya no existe en Qlik",
        404,
      );
    }

    return this.reportes.crearReporte({
      organizacionId: contexto.organizacionId,
      tenantQlikId: contexto.tenantId,
      creadoPorUsuarioId: contexto.usuarioId,
      nombre: entrada.nombre,
      flujoIdQlik: flujo.id,
      flujoNombreSnapshot: flujo.name,
      ...(flujo.spaceId ? { flujoEspacioIdQlik: flujo.spaceId } : {}),
      estado: "activa",
    });
  }
}

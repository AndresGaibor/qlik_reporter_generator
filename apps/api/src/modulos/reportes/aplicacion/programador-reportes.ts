import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { EjecutarReporte } from "./ejecutar-reporte.js";
import type { AlcanceBigQueryReporte } from "./preflight-dataflow.js";
import { calcularProximaEjecucion } from "./programacion-reporte.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";

export interface ContextoEjecucionProgramada {
  qlik: PuertoQlik;
  alcanceBigQuery: AlcanceBigQueryReporte;
}

export type ResolverContextoEjecucionProgramada = (entrada: {
  tenantQlikId: string;
  organizacionId: string;
  usuarioId: string;
}) => Promise<ContextoEjecucionProgramada>;

export interface ResultadoProgramacionProcesada {
  programacionId: string;
  ejecutada: boolean;
  error?: string;
}

export class ProgramadorReportes {
  constructor(
    private readonly repositorio: PuertoRepositorioReportes,
    private readonly bloqueos: PuertoBloqueoEjecucion,
    private readonly resolverContexto: ResolverContextoEjecucionProgramada,
    private readonly generarId?: () => string,
  ) {}

  async ejecutarPendientes(
    ahora = new Date(),
  ): Promise<ResultadoProgramacionProcesada[]> {
    const vencidas = await this.repositorio.listarProgramacionesVencidas(
      ahora,
      50,
    );
    const resultados: ResultadoProgramacionProcesada[] = [];

    for (const programacion of vencidas) {
      try {
        const configuracion = await this.repositorio.obtenerConfiguracionPorId(
          programacion.configuracionId,
        );
        if (!configuracion || configuracion.estado !== "activa") {
          resultados.push({
            programacionId: programacion.id,
            ejecutada: false,
            error: "Configuración de reporte no disponible o inactiva",
          });
          continue;
        }

        const siguiente = calcularProximaEjecucion(
          programacion.expresionCron,
          programacion.zonaHoraria,
          ahora,
        );
        const reclamada = await this.repositorio.intentarReclamarProgramacion(
          programacion.id,
          programacion.proximaEjecucionEn,
          siguiente,
          ahora,
        );
        if (!reclamada) {
          resultados.push({
            programacionId: programacion.id,
            ejecutada: false,
          });
          continue;
        }

        const contexto = await this.resolverContexto({
          tenantQlikId: configuracion.tenantQlikId,
          organizacionId: configuracion.organizacionId,
          usuarioId: configuracion.creadoPorUsuarioId,
        });
        await new EjecutarReporte(
          contexto.qlik,
          this.repositorio,
          this.bloqueos,
          contexto.alcanceBigQuery,
          this.generarId,
        ).ejecutar({
          tenantId: configuracion.tenantQlikId,
          organizacionId: configuracion.organizacionId,
          automatizacionIdQlik: configuracion.automatizacionIdQlik,
          usuarioId: configuracion.creadoPorUsuarioId,
          tipo: "programada",
        });
        resultados.push({ programacionId: programacion.id, ejecutada: true });
      } catch (error) {
        resultados.push({
          programacionId: programacion.id,
          ejecutada: false,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }
    return resultados;
  }
}

import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { Registrador } from "../../../plataforma/observabilidad/registrador.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import { copiarAutomatizacionPersonal } from "../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { AutomatizacionQlik } from "../../qlik/dominio/modelos-qlik.js";
import { esNoEncontradoQlik } from "../../qlik/infraestructura/error-api-qlik.js";
import type {
  AutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "./puertos/puerto-repositorio-automatizaciones-personales.js";
import {
  VERSION_CONTRATO_TALEND,
  validarContratoTalend,
} from "./servicio-contexto-talend.js";

export type MotivoReparacion =
  | "no_encontrado"
  | "contrato_obsoleto"
  | "estructura_incompatible"
  | "recreacion_manual";

export interface ContextoAutomatizacionPersonal {
  organizacionId: string;
  tenantQlikId: string;
  usuarioId: string;
  usuarioIdQlik: string;
  plantillaIdQlik: string;
  plantillaNombre: string;
}

export class ReemplazarAutomatizacionPersonal {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioAutomatizacionesPersonales,
    private readonly bloqueos: PuertoBloqueoEjecucion,
    private readonly registrador?: Registrador,
    private readonly hayEjecucionesActivas?: (
      automatizacionIdQlik: string,
    ) => Promise<boolean>,
  ) {}

  async obtenerOCrear(
    contexto: ContextoAutomatizacionPersonal,
  ): Promise<AutomatizacionPersonalPersistida> {
    return this.bloqueos
      .ejecutarExclusivo(this.clave(contexto), async () => {
        const persistida = await this.repositorio.obtener(
          contexto.usuarioId,
          contexto.tenantQlikId,
        );
        if (!persistida) return this.crear(contexto);
        const motivo = await this.motivoDeReparacion(persistida);
        if (!motivo) return persistida;
        return this.reemplazarDentroDelLock(persistida, contexto, motivo);
      })
      .then(async (resultado) => {
        if (resultado) return resultado;
        const persistida = await this.repositorio.obtener(
          contexto.usuarioId,
          contexto.tenantQlikId,
        );
        if (persistida) {
          if (persistida.contratoVersion !== VERSION_CONTRATO_TALEND) {
            throw new ErrorAplicacion(
              "WORKER_LOCK_BUSY",
              "El worker personal está siendo reparado; reintenta la ejecución",
              409,
            );
          }
          const motivo = await this.motivoDeReparacion(persistida);
          if (!motivo) return persistida;
        }
        throw new ErrorAplicacion(
          "WORKER_LOCK_BUSY",
          "No se pudo obtener el worker personal; reintenta la ejecución",
          409,
        );
      });
  }

  async recrear(
    contexto: ContextoAutomatizacionPersonal,
    persistidaInicial?: AutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida> {
    return this.bloqueos
      .ejecutarExclusivo(this.clave(contexto), async () => {
        const persistida =
          (this.repositorio.obtener
            ? await this.repositorio.obtener(
                contexto.usuarioId,
                contexto.tenantQlikId,
              )
            : null) ?? persistidaInicial;
        if (!persistida) {
          throw new ErrorAplicacion(
            "NO_ENCONTRADO",
            "Worker no encontrado",
            404,
          );
        }
        return this.reemplazarDentroDelLock(
          persistida,
          contexto,
          "recreacion_manual",
        );
      })
      .then((resultado) => {
        if (resultado) return resultado;
        throw new ErrorAplicacion(
          "WORKER_LOCK_BUSY",
          "No se pudo obtener el worker personal; reintenta la operación",
          409,
        );
      });
  }

  private async motivoDeReparacion(
    persistida: AutomatizacionPersonalPersistida,
  ): Promise<MotivoReparacion | null> {
    if (
      persistida.contratoVersion == null ||
      persistida.contratoVersion < VERSION_CONTRATO_TALEND
    ) {
      return "contrato_obsoleto";
    }
    try {
      const automatizacion = await this.qlik.obtenerAutomatizacion(
        persistida.automatizacionIdQlik,
      );
      try {
        validarContratoTalend(automatizacion.workspace ?? {});
        return null;
      } catch {
        return "estructura_incompatible";
      }
    } catch (error) {
      if (esNoEncontradoQlik(error)) return "no_encontrado";
      throw error;
    }
  }

  private async crear(
    contexto: ContextoAutomatizacionPersonal,
  ): Promise<AutomatizacionPersonalPersistida> {
    await this.validarPlantilla(contexto);
    const nuevo = await this.copiarValida(contexto);
    return this.repositorio.crear({
      organizacionId: contexto.organizacionId,
      tenantQlikId: contexto.tenantQlikId,
      usuarioId: contexto.usuarioId,
      automatizacionIdQlik: nuevo.id,
      automatizacionNombreSnapshot: nuevo.nombre,
      estado: "activo",
      contratoVersion: VERSION_CONTRATO_TALEND,
    });
  }

  private async reemplazarDentroDelLock(
    anterior: AutomatizacionPersonalPersistida,
    contexto: ContextoAutomatizacionPersonal,
    motivo: MotivoReparacion,
  ): Promise<AutomatizacionPersonalPersistida> {
    this.registrador?.info("worker.reparacion.iniciada", {
      usuarioId: contexto.usuarioId,
      tenantQlikId: contexto.tenantQlikId,
      workerLocalId: anterior.id,
      automatizacionIdQlikAnterior: anterior.automatizacionIdQlik,
      motivo,
    });
    let etapa = "validar-plantilla";
    try {
      await this.validarPlantilla(contexto);
      etapa = "copiar-validar-configurar";
      const nuevo = await this.copiarValida(contexto);
      let actualizada: AutomatizacionPersonalPersistida;
      try {
        const cambios = {
          automatizacionIdQlik: nuevo.id,
          automatizacionNombreSnapshot: nuevo.nombre,
          estado: "activo",
          mensajeError: null,
          contratoVersion: VERSION_CONTRATO_TALEND,
        } as const;
        actualizada = this.repositorio.actualizarScoped
          ? await this.repositorio.actualizarScoped(
              anterior.id,
              contexto.organizacionId,
              contexto.tenantQlikId,
              cambios,
            )
          : await this.repositorio.actualizar(anterior.id, cambios);
      } catch (error) {
        etapa = "persistir-asociacion";
        await this.eliminarCopia(nuevo.id);
        throw error;
      }
      this.registrador?.info("worker.reparacion.completada", {
        usuarioId: contexto.usuarioId,
        tenantQlikId: contexto.tenantQlikId,
        workerLocalId: anterior.id,
        automatizacionIdQlikAnterior: anterior.automatizacionIdQlik,
        automatizacionIdQlikNueva: nuevo.id,
        motivo,
      });
      await this.limpiarAnterior(anterior, contexto);
      return actualizada;
    } catch (error) {
      this.registrador?.error("worker.reparacion.fallida", {
        usuarioId: contexto.usuarioId,
        tenantQlikId: contexto.tenantQlikId,
        workerLocalId: anterior.id,
        automatizacionIdQlikAnterior: anterior.automatizacionIdQlik,
        motivo,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ErrorAplicacion) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "estadoHttp" in error
      ) {
        throw error;
      }
      throw new ErrorAplicacion(
        "WORKER_REPAIR_FAILED",
        "No se pudo preparar el worker para ejecutar el reporte. Intenta nuevamente más tarde.",
        422,
        {
          causa: error instanceof Error ? error.message : String(error),
          etapa,
        },
      );
    }
  }

  private async validarPlantilla(
    contexto: ContextoAutomatizacionPersonal,
  ): Promise<void> {
    let plantilla: AutomatizacionQlik;
    try {
      plantilla = await this.qlik.obtenerAutomatizacion(
        contexto.plantillaIdQlik,
      );
    } catch (error) {
      if (!esNoEncontradoQlik(error)) throw error;
      throw new ErrorAplicacion(
        "WORKER_REPAIR_FAILED",
        "No se pudo preparar el worker para ejecutar el reporte.",
        422,
        { causa: error },
      );
    }
    try {
      validarContratoTalend(plantilla.workspace ?? {});
    } catch (error) {
      throw new ErrorAplicacion(
        "WORKER_REPAIR_FAILED",
        "No se pudo preparar el worker para ejecutar el reporte.",
        422,
        { causa: error },
      );
    }
  }

  private async copiarValida(
    contexto: ContextoAutomatizacionPersonal,
  ): Promise<{ id: string; nombre: string }> {
    const resultado = await copiarAutomatizacionPersonal(this.qlik, {
      nombre: `${contexto.plantillaNombre} - Worker personal`,
      plantillaIdQlik: contexto.plantillaIdQlik,
      propietarioIdQlik: contexto.usuarioIdQlik,
    });
    if (!resultado.error && !resultado.incompatible) {
      return { id: resultado.id, nombre: resultado.nombre };
    }
    if (
      resultado.incompatible ||
      resultado.etapaError === "obtener" ||
      resultado.etapaError === "propietario" ||
      resultado.etapaError === "actualizar"
    ) {
      await this.eliminarCopia(resultado.id);
    }
    if (resultado.incompatible) {
      throw new ErrorAplicacion(
        "WORKER_REPAIR_FAILED",
        "No se pudo preparar el worker para ejecutar el reporte.",
        422,
        { causa: resultado.error },
      );
    }
    throw resultado.error instanceof Error
      ? resultado.error
      : new Error("No se pudo validar la copia del worker");
  }

  private async limpiarAnterior(
    anterior: AutomatizacionPersonalPersistida,
    contexto: ContextoAutomatizacionPersonal,
  ): Promise<void> {
    if (this.hayEjecucionesActivas) {
      try {
        if (await this.hayEjecucionesActivas(anterior.automatizacionIdQlik)) {
          return;
        }
      } catch (error) {
        this.registrador?.advertencia("worker.anterior.eliminacion_fallida", {
          usuarioId: contexto.usuarioId,
          tenantQlikId: contexto.tenantQlikId,
          workerLocalId: anterior.id,
          automatizacionIdQlikAnterior: anterior.automatizacionIdQlik,
          razon: "no_se_pudo_comprobar_ejecuciones_activas",
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
    try {
      await this.qlik.eliminarAutomatizacion(anterior.automatizacionIdQlik);
    } catch (error) {
      this.registrador?.advertencia("worker.anterior.eliminacion_fallida", {
        usuarioId: contexto.usuarioId,
        tenantQlikId: contexto.tenantQlikId,
        workerLocalId: anterior.id,
        automatizacionIdQlikAnterior: anterior.automatizacionIdQlik,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async eliminarCopia(id: string): Promise<void> {
    await this.qlik.eliminarAutomatizacion(id).catch(() => undefined);
  }

  private clave(contexto: ContextoAutomatizacionPersonal): string {
    return `automatizacion-personal:${contexto.tenantQlikId}:${contexto.usuarioId}`;
  }
}

import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import { copiarAutomatizacionPersonal } from "../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { AutomatizacionQlik } from "../../qlik/dominio/modelos-qlik.js";
import { ErrorApiQlik } from "../../qlik/infraestructura/error-api-qlik.js";
import type {
  AutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "./puertos/puerto-repositorio-automatizaciones-personales.js";
import { validarContratoTalend } from "./servicio-contexto-talend.js";

export interface ContextoObtenerOCrearAutomatizacionPersonal {
  organizacionId: string;
  tenantQlikId: string;
  usuarioId: string;
  usuarioIdQlik: string;
  plantillaIdQlik: string;
  plantillaNombre: string;
}

export class ObtenerOCrearAutomatizacionPersonal {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioAutomatizacionesPersonales,
    private readonly bloqueos: PuertoBloqueoEjecucion,
  ) {}

  async ejecutar(
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
  ): Promise<AutomatizacionPersonalPersistida> {
    const clave = `automatizacion-personal:${contexto.tenantQlikId}:${contexto.usuarioId}`;
    const resultado = await this.bloqueos.ejecutarExclusivo(clave, async () => {
      const persistida = await this.repositorio.obtener(
        contexto.usuarioId,
        contexto.tenantQlikId,
      );
      if (persistida) return this.resolverPersistida(persistida, contexto);
      return this.crearDesdePlantilla(contexto);
    });

    if (resultado) return resultado;
    const despuesDelLock = await this.repositorio.obtener(
      contexto.usuarioId,
      contexto.tenantQlikId,
    );
    if (despuesDelLock) {
      return this.resolverPersistida(despuesDelLock, contexto, false);
    }
    throw new ErrorAplicacion(
      "WORKER_LOCK_BUSY",
      "No se pudo obtener el lock del worker personal; reintenta la ejecución",
      409,
    );
  }

  private async resolverPersistida(
    persistida: AutomatizacionPersonalPersistida,
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
    puedeRecrear = true,
  ): Promise<AutomatizacionPersonalPersistida> {
    let automatizacion: AutomatizacionQlik;
    try {
      automatizacion = await this.qlik.obtenerAutomatizacion(
        persistida.automatizacionIdQlik,
      );
    } catch (error) {
      if (!esNoEncontradoQlik(error)) throw error;
      if (!puedeRecrear) {
        throw new ErrorAplicacion(
          "WORKER_LOCK_BUSY",
          "El worker personal desapareció mientras otro proceso mantiene el lock; reintenta la ejecución",
          409,
        );
      }
      await this.validarPlantilla(contexto);
      const nuevo = await this.copiarYValidar(contexto);
      return this.repositorio.actualizar(persistida.id, {
        automatizacionIdQlik: nuevo.id,
        nombreSnapshot: nuevo.nombre,
        estado: "activo",
        mensajeError: null,
      });
    }

    try {
      validarContratoTalend(automatizacion.workspace ?? {});
    } catch (error) {
      throw new ErrorAplicacion(
        "WORKER_INCOMPATIBLE",
        `El worker personal ${persistida.automatizacionIdQlik} no cumple el contrato Talend; requiere reparación explícita`,
        422,
        { causa: error },
      );
    }
    return persistida;
  }

  private async crearDesdePlantilla(
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
  ): Promise<AutomatizacionPersonalPersistida> {
    await this.validarPlantilla(contexto);
    const nuevo = await this.copiarYValidar(contexto);
    return this.repositorio.crear({
      organizacionId: contexto.organizacionId,
      tenantQlikId: contexto.tenantQlikId,
      usuarioId: contexto.usuarioId,
      automatizacionIdQlik: nuevo.id,
      nombreSnapshot: nuevo.nombre,
      estado: "activo",
    });
  }

  private async validarPlantilla(
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
  ): Promise<void> {
    let plantilla: AutomatizacionQlik;
    try {
      plantilla = await this.qlik.obtenerAutomatizacion(
        contexto.plantillaIdQlik,
      );
    } catch (error) {
      if (!esNoEncontradoQlik(error)) throw error;
      throw new ErrorAplicacion(
        "WORKER_TEMPLATE_INCOMPATIBLE",
        `La plantilla ${contexto.plantillaIdQlik} no existe o no cumple el contrato Talend; no se reparará automáticamente`,
        422,
        { causa: error },
      );
    }
    try {
      validarContratoTalend(plantilla.workspace ?? {});
    } catch (error) {
      throw new ErrorAplicacion(
        "WORKER_TEMPLATE_INCOMPATIBLE",
        `La plantilla ${contexto.plantillaIdQlik} no existe o no cumple el contrato Talend; no se reparará automáticamente`,
        422,
        { causa: error },
      );
    }
  }

  private async copiarYValidar(
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
  ) {
    const resultado = await copiarAutomatizacionPersonal(this.qlik, {
      nombre: `${contexto.plantillaNombre} - Worker personal`,
      plantillaIdQlik: contexto.plantillaIdQlik,
      propietarioIdQlik: contexto.usuarioIdQlik,
    });
    if (resultado.error) {
      if (!resultado.incompatible) throw resultado.error;
      await this.qlik
        .eliminarAutomatizacion(resultado.id)
        .catch(() => undefined);
      throw new ErrorAplicacion(
        "WORKER_COPY_INCOMPATIBLE",
        `La copia del worker personal ${resultado.id} no cumple el contrato Talend`,
        422,
        { causa: resultado.error },
      );
    }
    return resultado;
  }
}

function esNoEncontradoQlik(error: unknown): boolean {
  if (error instanceof ErrorApiQlik) return error.estadoHttp === 404;
  return (
    typeof error === "object" &&
    error !== null &&
    "estadoHttp" in error &&
    (error as { estadoHttp?: unknown }).estadoHttp === 404
  );
}

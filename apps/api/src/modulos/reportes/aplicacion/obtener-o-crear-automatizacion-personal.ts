import type { Registrador } from "../../../plataforma/observabilidad/registrador.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type {
  AutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "./puertos/puerto-repositorio-automatizaciones-personales.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";
import {
  type ContextoAutomatizacionPersonal,
  ReemplazarAutomatizacionPersonal,
} from "./reemplazar-automatizacion-personal.js";

export type ContextoObtenerOCrearAutomatizacionPersonal =
  ContextoAutomatizacionPersonal;

export class ObtenerOCrearAutomatizacionPersonal {
  private readonly servicio: ReemplazarAutomatizacionPersonal;

  constructor(
    qlik: PuertoQlik,
    repositorio: PuertoRepositorioAutomatizacionesPersonales,
    bloqueos: PuertoBloqueoEjecucion,
    registrador?: Registrador,
    repositorioReportes?: PuertoRepositorioReportes,
  ) {
    this.servicio = new ReemplazarAutomatizacionPersonal(
      qlik,
      repositorio,
      bloqueos,
      registrador,
      repositorioReportes?.tieneEjecucionesActivasPorAutomatizacion
        ? (id) =>
            repositorioReportes.tieneEjecucionesActivasPorAutomatizacion(id)
        : undefined,
    );
  }

  ejecutar(
    contexto: ContextoObtenerOCrearAutomatizacionPersonal,
  ): Promise<AutomatizacionPersonalPersistida> {
    return this.servicio.obtenerOCrear(contexto);
  }
}

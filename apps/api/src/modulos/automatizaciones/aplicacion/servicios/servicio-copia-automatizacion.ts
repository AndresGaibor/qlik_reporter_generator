import type { PuertoQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { AutomatizacionQlik } from "../../../qlik/dominio/modelos-qlik.js";
import { validarContratoTalend } from "../../../reportes/aplicacion/servicio-contexto-talend.js";

export interface ResultadoCopiaAutomatizacion {
  id: string;
  nombre: string;
  plantillaIdQlik: string;
  error?: unknown;
  incompatible?: boolean;
  tipoError?: "incompatible" | "integracion";
}

export interface EntradaCopiaAutomatizacionPersonal {
  nombre: string;
  plantillaIdQlik: string;
  propietarioIdQlik?: string;
}

/** Copia un worker sin mezclarle datos específicos de ningún reporte. */
export async function copiarAutomatizacionPersonal(
  qlik: PuertoQlik,
  entrada: EntradaCopiaAutomatizacionPersonal,
): Promise<ResultadoCopiaAutomatizacion> {
  const copia = await qlik.copiarAutomatizacion(
    entrada.plantillaIdQlik,
    entrada.nombre,
  );
  const id = copia.id;

  if (entrada.propietarioIdQlik) {
    try {
      await qlik.cambiarPropietarioAutomatizacion(
        id,
        entrada.propietarioIdQlik,
      );
    } catch (error) {
      return {
        id,
        nombre: entrada.nombre,
        plantillaIdQlik: entrada.plantillaIdQlik,
        error,
        incompatible: false,
        tipoError: "integracion",
      };
    }
  }

  let automatizacion: AutomatizacionQlik;
  try {
    automatizacion = await qlik.obtenerAutomatizacion(id);
  } catch (error) {
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      error,
      incompatible: false,
      tipoError: "integracion",
    };
  }

  const workspace = structuredClone(automatizacion.workspace ?? {}) as Record<
    string,
    unknown
  >;
  try {
    validarContratoTalend(workspace);
  } catch (error) {
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      error,
      incompatible: true,
      tipoError: "incompatible",
    };
  }

  try {
    await qlik.actualizarAutomatizacion(id, {
      name: entrada.nombre,
      description: "Worker personal reutilizable",
      schedules: [],
      workspace,
      maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
    });
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      incompatible: false,
    };
  } catch (error) {
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      error,
      incompatible: false,
      tipoError: "integracion",
    };
  }
}

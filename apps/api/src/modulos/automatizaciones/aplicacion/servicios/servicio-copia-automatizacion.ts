import type { CrearDesdePlantilla } from "@qlik/contratos/automatizaciones";
import { generarUuid } from "../../../../nucleo/valores/generar-uuid.js";
import type { PuertoQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import { validarContratoTalend } from "../../../reportes/aplicacion/servicio-contexto-talend.js";
import { aplicarReemplazosEnWorkspace } from "./servicio-reemplazo-workspace.js";

export interface ResultadoCopiaAutomatizacion {
  id: string;
  nombre: string;
  plantillaIdQlik: string;
  error?: unknown;
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
    await qlik
      .cambiarPropietarioAutomatizacion(id, entrada.propietarioIdQlik)
      .catch(() => undefined);
  }

  try {
    const automatizacion = await qlik.obtenerAutomatizacion(id);
    const workspace = structuredClone(automatizacion.workspace ?? {}) as Record<
      string,
      unknown
    >;
    validarContratoTalend(workspace);
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
    };
  } catch (error) {
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      error,
    };
  }
}

export async function copiarAutomatizacion(
  qlik: PuertoQlik,
  entrada: CrearDesdePlantilla,
): Promise<ResultadoCopiaAutomatizacion> {
  const copia = await qlik.copiarAutomatizacion(
    entrada.plantillaIdQlik,
    entrada.nombre,
  );
  const id = copia.id;
  let errorReemplazos: unknown;

  if (entrada.espacioIdQlik) {
    await qlik.cambiarEspacioAutomatizacion(id, entrada.espacioIdQlik);
  }
  if (entrada.propietarioIdQlik) {
    try {
      await qlik.cambiarPropietarioAutomatizacion(
        id,
        entrada.propietarioIdQlik,
      );
    } catch {
      // La copia puede conservar el propietario de la plantilla si Qlik no permite el cambio.
    }
  }

  const automatizacion = await qlik.obtenerAutomatizacion(id);
  const workspace = structuredClone(automatizacion.workspace ?? {}) as Record<
    string,
    unknown
  >;

  try {
    validarContratoTalend(workspace);
    modificarWorkspaceConMetadatosReporte(workspace, {
      appId: entrada.flujoId?.trim(),
      autor: resolverAutor(entrada),
    });
    if (entrada.reemplazosWorkspace.length > 0) {
      aplicarReemplazosEnWorkspace(
        workspace,
        entrada.reemplazosWorkspace as Array<{ ruta: string; valor: unknown }>,
      );
    }
  } catch (error) {
    errorReemplazos = error;
  }

  if (errorReemplazos) {
    return {
      id,
      nombre: entrada.nombre,
      plantillaIdQlik: entrada.plantillaIdQlik,
      error: errorReemplazos,
    };
  }

  const autor = resolverAutor(entrada);
  const descripcion = autor
    ? `Creado por ${autor}`
    : (automatizacion.description ?? "");

  try {
    await qlik.actualizarAutomatizacion(id, {
      name: entrada.nombre,
      // Las programaciones de reportes pertenecen a qlik_reportes_creator.
      schedules: [],
      workspace,
      description: descripcion,
      maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
    });
  } catch (error) {
    errorReemplazos = error;
  }

  if (entrada.propietarioIdQlik) {
    try {
      await qlik.cambiarPropietarioAutomatizacion(
        id,
        entrada.propietarioIdQlik,
      );
    } catch {
      // No bloquear creación por permisos de change-owner.
    }
  }

  return {
    id,
    nombre: entrada.nombre,
    plantillaIdQlik: entrada.plantillaIdQlik,
    ...(errorReemplazos ? { error: errorReemplazos } : {}),
  };
}

function modificarWorkspaceConMetadatosReporte(
  workspace: Record<string, unknown>,
  parametros: { appId?: string; autor?: string },
): void {
  const valores: Record<string, string> = {};
  if (parametros.appId) valores.Appid = parametros.appId;
  if (parametros.autor) {
    valores.autor = parametros.autor;
    valores.usuario = parametros.autor;
    valores.creador = parametros.autor;
    valores.gcp_autor = parametros.autor;
  }

  const blocks = (
    Array.isArray(workspace.blocks) ? workspace.blocks : []
  ) as Record<string, unknown>[];
  for (const block of blocks) {
    const nombre = String(block.name ?? "");
    const tipo = String(block.type ?? "");

    if (nombre === "listApps" && parametros.appId) {
      const inputs = (
        Array.isArray(block.inputs) ? block.inputs : []
      ) as Record<string, unknown>[];
      for (const input of inputs) {
        if (input.id === "8ce4fad0-107b-11ec-a6ac-2bd407ad134b") {
          input.value = parametros.appId;
        }
      }
    }

    if (tipo === "VariableBlock" && nombre in valores) {
      const operations = (
        Array.isArray(block.operations) ? block.operations : []
      ) as Record<string, unknown>[];
      if (operations[0]) {
        operations[0].value = valores[nombre];
      } else {
        block.operations = [
          {
            id: "set_value",
            key: generarUuid(),
            name: "Set value of { variable }",
            value: valores[nombre],
          },
        ];
      }
    }
  }

  const variables = (
    Array.isArray(workspace.variables) ? workspace.variables : []
  ) as Record<string, unknown>[];
  for (const variable of variables) {
    const nombre = String(variable.name ?? "");
    if (nombre in valores) variable.value = valores[nombre];
  }
}

function resolverAutor(entrada: CrearDesdePlantilla): string | undefined {
  const autor = entrada.autor?.trim();
  return autor || undefined;
}

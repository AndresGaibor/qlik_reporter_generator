import type { PuertoQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { AutomatizacionQlik } from "../../../qlik/dominio/modelos-qlik.js";
import { validarContratoTalend } from "../../../reportes/aplicacion/servicio-contexto-talend.js";

const SNIPPET_ESPERA_TALEND = "087a1ce0-037c-11ee-9163-4dcbc6412d48";

function agregarEsperaTalend(workspace: Record<string, unknown>) {
  if (!Array.isArray(workspace.blocks)) return;
  const blocks = workspace.blocks as Array<Record<string, unknown>>;
  const executeTask = blocks.find((block) => block.name === "executeTask");
  if (!executeTask) return;

  const esperaExistente = blocks.find(
    (block) => block.snippet_guid === SNIPPET_ESPERA_TALEND,
  );
  if (esperaExistente?.id) {
    executeTask.childId = esperaExistente.id;
    return;
  }

  const espera = {
    id: crypto.randomUUID().toUpperCase(),
    name: "waitForTasksToComplete",
    type: "SnippetBlock",
    inputs: [
      {
        id: "5c1caa40-037c-11ee-a59a-7d01d2b649cb",
        type: "string",
        value: "{ $.executeTask.executionId }",
        structure: [],
      },
      {
        id: "23551b60-0544-11ee-817d-439f0d9496f7",
        type: "select",
        value: "600",
        structure: [],
      },
    ],
    childId: executeTask.childId,
    settings: [
      { id: "blendr_on_error", type: "select", value: "stop", structure: [] },
    ],
    snippet_guid: SNIPPET_ESPERA_TALEND,
    datasourcetype_guid: "c0374370-c190-11ed-b1c6-ad8f32552428",
  };
  executeTask.childId = espera.id;
  blocks.push(espera);
}

export interface ResultadoCopiaAutomatizacion {
  id: string;
  nombre: string;
  plantillaIdQlik: string;
  error?: unknown;
  incompatible?: boolean;
  tipoError?: "incompatible" | "integracion";
  etapaError?: "obtener" | "propietario" | "actualizar";
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
      etapaError: "obtener",
    };
  }

  if (
    entrada.propietarioIdQlik &&
    automatizacion.ownerId !== entrada.propietarioIdQlik
  ) {
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
        etapaError: "propietario",
      };
    }
  }

  const workspace = structuredClone(automatizacion.workspace ?? {}) as Record<
    string,
    unknown
  >;
  try {
    validarContratoTalend(workspace);
    agregarEsperaTalend(workspace);
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
      etapaError: "actualizar",
    };
  }
}

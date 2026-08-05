import type { CrearDesdePlantilla } from "@qlik/contratos/automatizaciones";
import { generarUuid } from "../../../../nucleo/valores/generar-uuid.js";
import type { PuertoQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import { aplicarReemplazosEnWorkspace } from "./servicio-reemplazo-workspace.js";

export interface ResultadoCopiaAutomatizacion {
  id: string;
  nombre: string;
  plantillaIdQlik: string;
  error?: unknown;
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
      // Ignorar de forma segura si Qlik Cloud responde 422 o no permite cambiar el propietario por permisos
    }
  }

  const reemplazosEntrantes = [
    ...(entrada.reemplazosWorkspace as Array<{ ruta: string; valor: unknown }>),
  ];

  // ── Extracción / modificación de workspace ───────────────────────────────
  const automatizacion = await qlik.obtenerAutomatizacion(id);
  const workspace = structuredClone(automatizacion.workspace ?? {}) as Record<
    string,
    unknown
  >;

  if (entrada.flujoId) {
    try {
      const scriptRes = await qlik.obtenerScriptApp(entrada.flujoId, "current");
      const scriptTexto = scriptRes.script || "";

      // Regex para buscar: STORE [Filtro 1_DEFAULT] INTO [lib://Bancolombia prueba:SFTP//upload/ventas_incremental1.csv] (txt);
      const matchStore = scriptTexto.match(
        /STORE\s+.*?\s+INTO\s+\[lib:\/\/.*?\/\/.*?\/(.*?)\.(csv|txt|qvd|json)\]/i,
      );

      const archivoEntrada = matchStore
        ? matchStore[1].trim()
        : "ventas_incremental1";
      const extension = matchStore ? matchStore[2].trim() : "csv";
      const appId = entrada.flujoId;
      const dataset = archivoEntrada;
      const tablaDestino = entrada.tablaId
        ? entrada.tablaId.trim()
        : "ventas_filtro_curados";

      modificarWorkspaceConParametrosFlujo(workspace, {
        appId,
        dataset,
        archivoEntrada,
        tablaDestino,
        extension,
      });
    } catch (e) {
      errorReemplazos = e;
    }
  }

  // Modificar workspace con parámetros de reporte (fechadesde, fechahasta, campos, formatosalida, gcp_tabla)
  try {
    modificarWorkspaceConParametrosReporte(workspace, entrada);
  } catch (e) {
    errorReemplazos = e;
  }

  // Aplicar reemplazos adicionales si existen
  if (reemplazosEntrantes.length > 0) {
    try {
      aplicarReemplazosEnWorkspace(workspace, reemplazosEntrantes);
    } catch (e) {
      errorReemplazos = e;
    }
  }

  const autorFinal =
    entrada.autor ||
    (entrada.nombre.startsWith("Reporte ")
      ? entrada.nombre.split(" ").slice(2).join(" ")
      : "");

  const descripcionFinal = autorFinal
    ? `Creado por ${autorFinal}`
    : (automatizacion.description ?? "");

  try {
    await qlik.actualizarAutomatizacion(id, {
      name: entrada.nombre,
      schedules: automatizacion.schedules ?? [],
      workspace,
      description: descripcionFinal,
      maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
    });
  } catch (e) {
    errorReemplazos = e;
  }

  // El cambio de propietario exige rol TenantAdmin o scope admin.automations en Qlik
  // (ver docs/endpoints/automations.md). Con credenciales de usuario normal siempre
  // responde 403, por lo que no debe bloquear la creación de la automatización.
  if (entrada.propietarioIdQlik) {
    try {
      await qlik.cambiarPropietarioAutomatizacion(
        id,
        entrada.propietarioIdQlik,
      );
    } catch {
      // Ignorar de forma segura: la copia conserva el propietario de la plantilla.
    }
  }

  return {
    id,
    nombre: entrada.nombre,
    plantillaIdQlik: entrada.plantillaIdQlik,
    error: errorReemplazos,
  };
}

/**
 * Modifica las variables y bloques en la estructura JSON del Automate clonado
 */
function modificarWorkspaceConParametrosFlujo(
  workspace: Record<string, unknown>,
  params: {
    appId: string;
    dataset: string;
    archivoEntrada: string;
    tablaDestino: string;
    extension: string;
  },
): void {
  const blocks = (
    Array.isArray(workspace.blocks) ? workspace.blocks : []
  ) as Record<string, unknown>[];

  // Map de valores para variables
  const mapaValores: Record<string, string> = {
    Appid: params.appId,
    Dataset: params.dataset,
    ArchivoEntrada: params.archivoEntrada,
    TablaDestino: params.tablaDestino,
    Extension: params.extension,
  };

  for (const block of blocks) {
    const name = String(block.name || "");
    const type = String(block.type || "");

    // Configurar listApps (Qlik Cloud Services - List Apps) con el espacio/app si aplica
    if (name === "listApps" || type === "EndpointBlock") {
      const inputs = (
        Array.isArray(block.inputs) ? block.inputs : []
      ) as Record<string, unknown>[];
      for (const input of inputs) {
        if (input.id === "8ce4fad0-107b-11ec-a6ac-2bd407ad134b") {
          input.value = params.appId;
        }
      }
    }

    // Configurar bloques VariableBlock (DataflowNombre, Appid, Dataset, ArchivoEntrada, TablaDestino, Extension)
    if (type === "VariableBlock" && name in mapaValores) {
      const valorNuevo = mapaValores[name];
      const operations = (
        Array.isArray(block.operations) ? block.operations : []
      ) as Record<string, unknown>[];
      if (operations.length > 0) {
        operations[0].value = valorNuevo;
      } else {
        block.operations = [
          {
            id: "set_value",
            key: generarUuid(),
            name: "Set value of { variable }",
            value: valorNuevo,
          },
        ];
      }
    }
  }

  // Actualizar también la declaración global en la propiedad variables si existe
  const variables = (
    Array.isArray(workspace.variables) ? workspace.variables : []
  ) as Record<string, unknown>[];
  for (const v of variables) {
    const vName = String(v.name || "");
    if (vName in mapaValores) {
      v.value = mapaValores[vName];
    }
  }
}

async function aplicarReemplazos(
  qlik: PuertoQlik,
  automatizacionId: string,
  reemplazos: Array<{ ruta: string; valor: unknown }>,
): Promise<void> {
  const automatizacion = await qlik.obtenerAutomatizacion(automatizacionId);
  const workspace = structuredClone(automatizacion.workspace ?? {});
  aplicarReemplazosEnWorkspace(workspace, reemplazos);
  await qlik.actualizarAutomatizacion(automatizacionId, {
    name: automatizacion.name,
    schedules: automatizacion.schedules ?? [],
    workspace,
    description: automatizacion.description ?? "",
    maxConcurrentRuns: automatizacion.maxConcurrentRuns ?? 1,
  });
}

function modificarWorkspaceConParametrosReporte(
  workspace: Record<string, unknown>,
  entrada: CrearDesdePlantilla,
): void {
  const blocks = (
    Array.isArray(workspace.blocks) ? workspace.blocks : []
  ) as Record<string, unknown>[];

  const fDesde = entrada.fechaDesde
    ? `${entrada.fechaDesde.split(" ")[0]} 00:00:00`
    : undefined;
  const fHasta = entrada.fechaHasta
    ? `${entrada.fechaHasta.split(" ")[0]} 00:00:00`
    : undefined;
  const strCampos =
    entrada.columnas && entrada.columnas.length > 0
      ? entrada.columnas.join(",")
      : undefined;
  const fmtSalida = entrada.formatoSalida || "CSV";

  const autorFinal =
    entrada.autor ||
    (entrada.nombre.startsWith("Reporte ")
      ? entrada.nombre.split(" ").slice(2).join(" ")
      : "");

  const mapaValores: Record<string, string> = {};
  if (fDesde) mapaValores["fechadesde"] = fDesde;
  if (fHasta) mapaValores["fechahasta"] = fHasta;
  if (strCampos !== undefined) mapaValores["campos"] = strCampos;
  mapaValores["formatosalida"] = fmtSalida;
  if (autorFinal) {
    mapaValores["autor"] = autorFinal;
    mapaValores["usuario"] = autorFinal;
    mapaValores["creador"] = autorFinal;
    mapaValores["gcp_autor"] = autorFinal;
  }

  for (const block of blocks) {
    const name = String(block.name || "");
    const type = String(block.type || "");

    // 1. Modificar VariableBlocks (fechadesde, fechahasta, campos, formatosalida, autor)
    if (type === "VariableBlock" && name in mapaValores) {
      const valorNuevo = mapaValores[name];
      const operations = (
        Array.isArray(block.operations) ? block.operations : []
      ) as Record<string, unknown>[];
      if (operations.length > 0) {
        operations[0].value = valorNuevo;
      } else {
        block.operations = [
          {
            id: "set_value",
            key: generarUuid(),
            name: "Set value of { variable }",
            value: valorNuevo,
          },
        ];
      }
    }

    // 2. Modificar bloque executeTask (EndpointBlock) con gcp_tabla y gcp_autor
    if (name === "executeTask" || type === "EndpointBlock") {
      const inputs = (
        Array.isArray(block.inputs) ? block.inputs : []
      ) as Record<string, unknown>[];
      for (const input of inputs) {
        if (input.mode === "keyValue" && Array.isArray(input.value)) {
          const listKv = input.value as Array<{ key: string; value: string }>;
          for (const item of listKv) {
            if (item.key === "gcp_tabla" && entrada.tablaId) {
              item.value = entrada.tablaId;
            }
            if (
              (item.key === "gcp_autor" ||
                item.key === "autor" ||
                item.key === "usuario") &&
              autorFinal
            ) {
              item.value = autorFinal;
            }
          }
        }
      }
    }
  }

  // 3. Modificar lista global de variables si existe
  const variables = (
    Array.isArray(workspace.variables) ? workspace.variables : []
  ) as Record<string, unknown>[];
  for (const v of variables) {
    const vName = String(v.name || "");
    if (vName in mapaValores) {
      v.value = mapaValores[vName];
    }
  }
}

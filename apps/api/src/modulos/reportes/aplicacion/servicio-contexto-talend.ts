import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";

const VARIABLES_TALEND = {
  bq_select_data: { bloque: "BqSelectData", campo: "bqSelectData" },
  bq_number_csv: { bloque: "BqNumberCsv", campo: "bqNumberCsv" },
  bq_export_data: { bloque: "BqExportData", campo: "bqExportData" },
  bq_drop: { bloque: "BqDrop", campo: "bqDrop" },
} as const;

export function inyectarContextoTalend(
  workspace: Record<string, unknown>,
  consultas: ConsultasTalendBigQuery,
): Record<string, unknown> {
  const copia = structuredClone(workspace);
  validarContratoTalend(copia);
  const blocks = Array.isArray(copia.blocks) ? copia.blocks : [];

  for (const [claveTalend, definicion] of Object.entries(VARIABLES_TALEND)) {
    const bloque = buscarBloque(blocks, definicion.bloque);
    const operaciones = Array.isArray(bloque.operations)
      ? bloque.operations
      : [];
    const setValue = operaciones.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        String((item as Record<string, unknown>).id ?? "") === "set_value",
    ) as Record<string, unknown> | undefined;
    if (!setValue) {
      throw new Error(
        `La automatización base no contiene set_value en ${definicion.bloque} para ${claveTalend}`,
      );
    }
    setValue.value = consultas[definicion.campo];
  }

  return copia;
}

export function validarContratoTalend(
  workspace: Record<string, unknown>,
): void {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  validarExecuteTask(blocks);
  for (const [claveTalend, definicion] of Object.entries(VARIABLES_TALEND)) {
    const bloque = buscarBloque(blocks, definicion.bloque);
    const operaciones = Array.isArray(bloque.operations)
      ? bloque.operations
      : [];
    const setValue = operaciones.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        String((item as Record<string, unknown>).id ?? "") === "set_value",
    );
    if (!setValue) {
      throw new Error(
        `La automatización base no contiene set_value en ${definicion.bloque} para ${claveTalend}`,
      );
    }
  }
}

function validarExecuteTask(blocks: unknown[]): void {
  const executeTask = buscarBloque(blocks, "executeTask");
  const inputs = Array.isArray(executeTask.inputs) ? executeTask.inputs : [];
  const keyValueInput = inputs.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as Record<string, unknown>).mode === "keyValue" &&
      Array.isArray((item as Record<string, unknown>).value),
  ) as Record<string, unknown> | undefined;

  if (!keyValueInput || !Array.isArray(keyValueInput.value)) {
    throw new Error(
      'El bloque "executeTask" no contiene el contexto key/value requerido por Talend',
    );
  }

  const contexto = keyValueInput.value as Array<Record<string, unknown>>;
  const credenciales = contexto.find((item) => item.key === "credenciales");
  if (!credenciales) {
    throw new Error(
      'El bloque "executeTask" no referencia el contexto "credenciales" requerido por Talend',
    );
  }

  for (const [clave, definicion] of Object.entries(VARIABLES_TALEND)) {
    const item = contexto.find((entrada) => entrada.key === clave);
    const referenciaEsperada = `{ $.${definicion.bloque} }`;
    if (!item) {
      throw new Error(
        `El bloque "executeTask" no referencia el contexto "${clave}" requerido por Talend`,
      );
    }
    if (item.value !== referenciaEsperada) {
      throw new Error(
        `El contexto "${clave}" debe referenciar ${referenciaEsperada}`,
      );
    }
  }
}

function buscarBloque(
  blocks: unknown[],
  nombre: string,
): Record<string, unknown> {
  const bloque = blocks.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      String((item as Record<string, unknown>).name ?? "") === nombre,
  ) as Record<string, unknown> | undefined;
  if (!bloque) {
    throw new Error(
      `La automatización base no contiene el bloque "${nombre}" requerido`,
    );
  }
  return bloque;
}

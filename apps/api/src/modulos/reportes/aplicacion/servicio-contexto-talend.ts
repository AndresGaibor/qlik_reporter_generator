import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";

const VARIABLES_TALEND = {
  bq_number_csv: { bloque: "BqNumberCsv", campo: "bqNumberCsv" },
  bq_export_data: { bloque: "BqExportData", campo: "bqExportData" },
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

export function diagnosticarContratoTalend(
  workspace: Record<string, unknown>,
): string[] {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  const problemas: string[] = [];
  const contextos = {
    credenciales: { bloque: "Credenciales" },
    ...VARIABLES_TALEND,
  } as const;

  const executeTask = encontrarBloque(blocks, "executeTask");
  if (!executeTask) {
    problemas.push('Falta el bloque "executeTask"');
  } else {
    const inputs = Array.isArray(executeTask.inputs) ? executeTask.inputs : [];
    const keyValueInput = inputs.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).mode === "keyValue" &&
        Array.isArray((item as Record<string, unknown>).value),
    ) as Record<string, unknown> | undefined;
    if (!keyValueInput || !Array.isArray(keyValueInput.value)) {
      problemas.push(
        'El bloque "executeTask" no contiene el contexto key/value requerido por Talend',
      );
    } else {
      const contexto = keyValueInput.value as Array<Record<string, unknown>>;
      for (const [clave, definicion] of Object.entries(contextos)) {
        const item = contexto.find((entrada) => entrada.key === clave);
        const referenciaEsperada = `{ $.${definicion.bloque} }`;
        if (!item) {
          problemas.push(`Falta el contexto "${clave}" en executeTask`);
        } else if (item.value !== referenciaEsperada) {
          problemas.push(
            `El contexto "${clave}" debe referenciar ${referenciaEsperada}`,
          );
        }
      }
    }
  }

  for (const definicion of Object.values(contextos)) {
    const bloque = encontrarBloque(blocks, definicion.bloque);
    if (!bloque) {
      problemas.push(`Falta el bloque "${definicion.bloque}"`);
      continue;
    }
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
      problemas.push(`Falta set_value en el bloque "${definicion.bloque}"`);
    }
  }
  return problemas;
}

export function validarContratoTalend(
  workspace: Record<string, unknown>,
): void {
  const problemas = diagnosticarContratoTalend(workspace);
  if (problemas.length > 0) {
    throw new Error(problemas.join("; "));
  }
}

function encontrarBloque(
  blocks: unknown[],
  nombre: string,
): Record<string, unknown> | undefined {
  return blocks.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      String((item as Record<string, unknown>).name ?? "") === nombre,
  ) as Record<string, unknown> | undefined;
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

import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";

export const VERSION_CONTRATO_TALEND = 1;

const CONTEXTOS_TALEND = {
  credenciales: { bloque: "Credenciales" },
  sql: { bloque: "sql" },
  job_id: { bloque: "jobid" },
  id_projecto: { bloque: "projectid" },
} as const;

export function inyectarContextoTalend(
  workspace: Record<string, unknown>,
  consultas: ConsultasTalendBigQuery,
): Record<string, unknown> {
  const copia = structuredClone(workspace);
  validarContratoTalend(copia);
  const blocks = Array.isArray(copia.blocks) ? copia.blocks : [];

  inyectarVariable(blocks, "sql", consultas.sql, "sql");
  if (consultas.jobId !== undefined) {
    inyectarVariable(blocks, "jobid", consultas.jobId, "job_id");
  }
  if (consultas.projectId !== undefined) {
    inyectarVariable(blocks, "projectid", consultas.projectId, "id_projecto");
  }
  return copia;
}

export function diagnosticarContratoTalend(
  workspace: Record<string, unknown>,
): string[] {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  const problemas: string[] = [];
  const contextos = CONTEXTOS_TALEND;

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

function inyectarVariable(
  blocks: unknown[],
  nombreBloque: string,
  valor: string,
  claveTalend: string,
): void {
  const bloque = buscarBloque(blocks, nombreBloque);
  const operaciones = Array.isArray(bloque.operations) ? bloque.operations : [];
  const setValue = operaciones.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      String((item as Record<string, unknown>).id ?? "") === "set_value",
  ) as Record<string, unknown> | undefined;
  if (!setValue) {
    throw new Error(
      `La automatización base no contiene set_value en ${nombreBloque} para ${claveTalend}`,
    );
  }
  setValue.value = valor;
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
  const bloque = encontrarBloque(blocks, nombre);
  if (!bloque) {
    throw new Error(
      `La automatización base no contiene el bloque "${nombre}" requerido`,
    );
  }
  return bloque;
}

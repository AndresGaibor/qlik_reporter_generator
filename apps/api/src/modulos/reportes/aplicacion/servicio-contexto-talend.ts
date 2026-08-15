export function inyectarContextoTalend(
  workspace: Record<string, unknown>,
  valores: Record<string, string>,
): Record<string, unknown> {
  const copia = structuredClone(workspace);
  const blocks = Array.isArray(copia.blocks) ? copia.blocks : [];
  const executeTask = blocks.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      String((item as Record<string, unknown>).name ?? "") === "executeTask",
  ) as Record<string, unknown> | undefined;

  if (!executeTask) {
    throw new Error(
      'La automatización base no contiene el bloque "executeTask" requerido por Talend',
    );
  }

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
      'El bloque "executeTask" no contiene una entrada key/value para el contexto Talend',
    );
  }

  const lista = keyValueInput.value as Array<Record<string, unknown>>;
  for (const [clave, valor] of Object.entries(valores)) {
    const existente = lista.find((item) => item.key === clave);
    if (existente) existente.value = valor;
    else lista.push({ key: clave, value: valor });
  }

  return copia;
}

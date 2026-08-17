export interface ParamEntry {
  clave: string;
  valor: unknown;
}

export interface BloqueInfo {
  tipo: string;
  nombre: string;
  parametros: ParamEntry[];
  grupos: Array<{ clave: string; items: ParamEntry[] }>;
}

export interface VariableInfo {
  nombre: string;
  valor: unknown;
}

const TIPOS_BLOQUE_OCULTOS = new Set([
  "start",
  "startblock",
  "stop",
  "stopblock",
  "output",
  "showblock",
  "executetask",
  "endpointblock",
  "fechahasta",
  "variableblock",
  "formatosalida",
  "campos",
  "fechadesde",
]);

function entriesSinInternos(
  obj: Record<string, unknown>,
): Array<[string, unknown]> {
  return Object.entries(obj).filter(
    ([k]) => !k.startsWith("_") && !k.startsWith("internal"),
  );
}

function entriesValidas(obj: unknown): Array<[string, unknown]> {
  if (typeof obj !== "object" || obj === null) return [];
  return entriesSinInternos(obj as Record<string, unknown>);
}

export function extraerBloques(
  workspace: Record<string, unknown>,
): BloqueInfo[] {
  const blocks = workspace.blocks;
  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((bloque, indice) => {
      const b = bloque as Record<string, unknown>;
      const tipo = String(b.type ?? b.blockType ?? "desconocido");
      const nombre = String(b.name ?? b.title ?? `Bloque ${indice}`);

      const settings = (b.settings ?? b.parameters ?? {}) as Record<
        string,
        unknown
      >;

      const grupos: BloqueInfo["grupos"] = [];
      const parametros: ParamEntry[] = [];

      for (const [clave, valor] of entriesValidas(settings)) {
        if (Array.isArray(valor)) {
          if (valor.length > 0 && typeof valor[0] === "object") {
            const items: ParamEntry[] = [];
            for (const item of valor as unknown[]) {
              if (typeof item === "object" && item !== null) {
                for (const [ik, iv] of entriesValidas(item)) {
                  items.push({ clave: ik, valor: iv });
                }
              } else {
                items.push({ clave: clave, valor: item });
              }
            }
            grupos.push({ clave, items });
          } else {
            parametros.push({ clave, valor });
          }
        } else if (typeof valor === "object" && valor !== null) {
          for (const [ik, iv] of entriesValidas(valor)) {
            parametros.push({ clave: `${clave}.${ik}`, valor: iv });
          }
        } else {
          parametros.push({ clave, valor });
        }
      }

      if (b.connectorId && tipo === "EndpointBlock") {
        parametros.push({ clave: "connectorId", valor: b.connectorId });
      }
      if (b.endpointId && tipo === "EndpointBlock") {
        parametros.push({ clave: "endpointId", valor: b.endpointId });
      }
      if (b.snippetId) {
        parametros.push({ clave: "snippetId", valor: b.snippetId });
      }

      return { tipo, nombre, parametros, grupos };
    })
    .filter(
      (bloque) =>
        !TIPOS_BLOQUE_OCULTOS.has(bloque.tipo.toLowerCase()) &&
        !TIPOS_BLOQUE_OCULTOS.has(bloque.nombre.toLowerCase()),
    );
}

export function extraerVariables(
  workspace: Record<string, unknown>,
): VariableInfo[] {
  const vars = workspace.variables;
  const blocks = workspace.blocks;
  const mapaValores: Record<string, unknown> = {};

  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      const block = b as Record<string, unknown>;
      if (block.type === "VariableBlock" && block.name) {
        const varNombre = String(block.name);
        const operations = block.operations as
          | Array<Record<string, unknown>>
          | undefined;
        if (
          Array.isArray(operations) &&
          operations.length > 0 &&
          operations[0].value !== undefined
        ) {
          mapaValores[varNombre] = operations[0].value;
        }
      }
    }
  }

  if (!Array.isArray(vars)) return [];

  return vars.map((v) => {
    const variable = v as Record<string, unknown>;
    const nombre = String(variable.name ?? "sin nombre");
    const valorDirecto = variable.value ?? variable.defaultValue;
    const valorOp = mapaValores[nombre];
    const valorFinal =
      valorDirecto !== undefined && valorDirecto !== ""
        ? valorDirecto
        : (valorOp ?? "");

    return {
      nombre,
      valor: valorFinal,
    };
  });
}

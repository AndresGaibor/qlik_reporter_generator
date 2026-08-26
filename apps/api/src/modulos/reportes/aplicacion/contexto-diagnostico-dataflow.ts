import type { DiagnosticoVNext } from "./compilador-vnext/modelo.js";
import { escanearSentenciasQlik } from "./compilador-vnext/scanner-qlik.js";

export function localizarComponenteDataflow(
  script: string,
  diagnostico: DiagnosticoVNext,
): string | undefined {
  const offsets = localizarOffsetsDiagnostico(script, diagnostico);
  if (offsets.length === 0) return undefined;

  try {
    const sentencias = escanearSentenciasQlik(script);
    let componentesPendientes: string[] = [];

    for (const sentencia of sentencias) {
      const anotados = extraerComponentesAnotados(sentencia.text);
      if (anotados.length > 0) componentesPendientes = anotados;

      const codigo = sentencia.text
        .replace(/\/\/.*$/gm, "")
        .replace(/--.*$/gm, "");
      const esCarga = /\bLOAD\b/i.test(codigo);
      const componenteActual = esCarga
        ? componentesPendientes.shift()
        : undefined;

      if (
        offsets.some(
          (offset) =>
            offset >= sentencia.span.start && offset < sentencia.span.end,
        )
      ) {
        return componenteActual;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extraerComponentesAnotados(texto: string): string[] {
  const componentes: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const comentario = linea.match(/^\s*\/\/\s*(.+)$/)?.[1];
    if (!comentario) continue;
    for (const coincidencia of comentario.matchAll(/\[([^\]]+)\]/g)) {
      const nombre = coincidencia[1]?.trim();
      if (nombre) componentes.push(nombre);
    }
  }
  return componentes;
}

function localizarOffsetsDiagnostico(
  script: string,
  diagnostico: DiagnosticoVNext,
): number[] {
  const offsets: number[] = [];
  const snippet = diagnostico.snippet?.trim();
  if (snippet) {
    let desde = 0;
    while (desde < script.length) {
      const indice = script.indexOf(snippet, desde);
      if (indice < 0) break;
      offsets.push(indice);
      desde = indice + Math.max(1, snippet.length);
    }
  }

  if (offsets.length > 0) return offsets;

  const inicio = diagnostico.span.start;
  if (inicio >= 0 && inicio < script.length) offsets.push(inicio);
  return offsets;
}

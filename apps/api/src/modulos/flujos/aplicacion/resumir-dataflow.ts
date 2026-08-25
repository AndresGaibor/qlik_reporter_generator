import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
import { compilarDataflowVNext } from "../../reportes/aplicacion/compilador-vnext/index.js";
import { ErrorCompilacionVNext } from "../../reportes/aplicacion/compilador-vnext/modelo.js";
import { parsearDataflow } from "../../reportes/aplicacion/parser-dataflow.js";
import type {
  CampoDataflow,
  PlanDataflow,
} from "../../reportes/dominio/plan-dataflow.js";

interface EntradaResumenDataflow {
  flujoId: string;
  nombre: string;
  script: string;
  erroresQlik?: string[];
  advertenciasQlik?: string[];
  analizadoEn?: string;
}

export function resumirDataflowParaUsuario(
  entrada: EntradaResumenDataflow,
): ResumenReporteDataflow {
  if (esDataflowInvalidoGeneradoPorQlik(entrada.script)) {
    return {
      flujoId: entrada.flujoId,
      nombre: entrada.nombre,
      descripcion:
        "Qlik Cloud no pudo generar el reporte porque el diseño del Dataflow contiene errores.",
      campos: [],
      filtros: [],
      estado: "script_no_compatible",
      advertencias: [
        "Abre el Dataflow en Qlik Cloud, corrige los pasos marcados con error y luego selecciona “Actualizar resumen”.",
      ],
      analizadoEn: entrada.analizadoEn ?? new Date().toISOString(),
    };
  }
  const plan = parsearDataflow(entrada.script);
  const campos = proyectarCampos(plan);
  const filtros = plan.pasos
    .filter((paso) => paso.tipo === "filtrar")
    .flatMap((paso) => dividirCondicionesAnd(paso.condicion))
    .map((condicion) => proyectarFiltro(condicion))
    .filter((filtro) => filtro !== undefined);
  const compatibilidad = evaluarCompatibilidadVNext(entrada.script);
  const advertencias = eliminarDuplicados(
    [
      ...(entrada.erroresQlik ?? []),
      ...(entrada.advertenciasQlik ?? []),
      ...compatibilidad.advertencias,
    ].map(limpiarDetalleTecnico),
  );
  const fuente = plan.fuentes[0];
  const partesTabla = fuente?.tabla.split(".") ?? [];
  const estado =
    (entrada.erroresQlik?.length ?? 0) > 0 || !compatibilidad.compatible
      ? "script_no_compatible"
      : filtros.length === 0
        ? "sin_filtros"
        : "analizado";

  return {
    flujoId: entrada.flujoId,
    nombre: entrada.nombre,
    descripcion: generarDescripcion(plan, filtros.length),
    ...(fuente
      ? {
          fuentePrincipal: {
            nombre: humanizar(partesTabla.at(-1) ?? fuente.tabla),
            tabla: fuente.tabla,
            ...(partesTabla.length >= 2 ? { dataset: partesTabla.at(-2) } : {}),
          },
        }
      : {}),
    ...(plan.salida.tablaLogica
      ? { tablaDestino: plan.salida.tablaLogica }
      : {}),
    campos,
    filtros,
    ...(detectarRangoTemporal(filtros)
      ? { rangoTemporal: detectarRangoTemporal(filtros) }
      : {}),
    estado,
    advertencias,
    analizadoEn: entrada.analizadoEn ?? new Date().toISOString(),
  };
}

function esDataflowInvalidoGeneradoPorQlik(script: string): boolean {
  return (
    /contains\s+validation\s+errors/i.test(script) ||
    /throw\s+InvalidDataflow\s*\(\s*\)/i.test(script)
  );
}

function evaluarCompatibilidadVNext(script: string): {
  compatible: boolean;
  advertencias: string[];
} {
  try {
    const resultado = compilarDataflowVNext(script);
    return {
      compatible: true,
      advertencias: resultado.diagnostics.map((item) => item.message),
    };
  } catch (error) {
    if (error instanceof ErrorCompilacionVNext) {
      return { compatible: false, advertencias: [error.diagnostic.message] };
    }
    return {
      compatible: false,
      advertencias: [
        error instanceof Error
          ? error.message
          : "No se pudo analizar el Dataflow con el compilador actual",
      ],
    };
  }
}

function limpiarDetalleTecnico(mensaje: string): string {
  if (/contains\s+validation\s+errors|InvalidDataflow/i.test(mensaje)) {
    return "Qlik Cloud encontró errores en el diseño del Dataflow. Corrígelos en Qlik y actualiza el resumen.";
  }
  return mensaje
    .replace(
      /\s*\(pestaña\s+\d+(?:,\s*línea\s+\d+)?(?:,\s*columna\s+\d+)?\)\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function eliminarDuplicados(mensajes: string[]): string[] {
  return [...new Set(mensajes.filter(Boolean))];
}

export function resumenScriptNoDisponible(
  flujoId: string,
  nombre: string,
  mensaje: string,
): ResumenReporteDataflow {
  return {
    flujoId,
    nombre,
    campos: [],
    filtros: [],
    estado: "script_no_disponible",
    advertencias: [mensaje],
    analizadoEn: new Date().toISOString(),
  };
}

function proyectarCampos(plan: PlanDataflow): ResumenReporteDataflow["campos"] {
  const definiciones = new Map<string, CampoDataflow>();
  for (const fuente of plan.fuentes) {
    for (const campo of fuente.campos) definiciones.set(campo.alias, campo);
  }
  for (const paso of plan.pasos) {
    if (paso.tipo !== "proyectar") continue;
    for (const campo of paso.campos) definiciones.set(campo.alias, campo);
  }

  return plan.salida.campos.map((alias) => {
    const campo = definiciones.get(alias);
    const tipoInferido = campo
      ? inferirTipo(campo.expresion, alias)
      : undefined;
    return {
      nombreVisible: humanizar(alias),
      alias,
      ...(tipoInferido ? { tipoInferido } : {}),
    };
  });
}

function dividirCondicionesAnd(condicion: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let comilla: "'" | '"' | undefined;
  let parentesis = 0;
  let corchetes = 0;

  for (let i = 0; i < condicion.length; i += 1) {
    const caracter = condicion[i] ?? "";
    const siguiente = condicion[i + 1] ?? "";
    if (comilla) {
      actual += caracter;
      if (caracter === comilla) {
        if (siguiente === comilla) {
          actual += siguiente;
          i += 1;
        } else comilla = undefined;
      }
      continue;
    }
    if (caracter === "'" || caracter === '"') {
      comilla = caracter;
      actual += caracter;
      continue;
    }
    if (caracter === "[") corchetes += 1;
    if (caracter === "]") corchetes = Math.max(0, corchetes - 1);
    if (corchetes === 0) {
      if (caracter === "(") parentesis += 1;
      if (caracter === ")") parentesis = Math.max(0, parentesis - 1);
    }
    if (
      corchetes === 0 &&
      parentesis === 0 &&
      /^AND\b/i.test(condicion.slice(i)) &&
      (i === 0 || /\s/.test(condicion[i - 1] ?? ""))
    ) {
      if (actual.trim()) partes.push(actual.trim());
      actual = "";
      i += 2;
      continue;
    }
    actual += caracter;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes.length > 0 ? partes : [condicion.trim()];
}

function proyectarFiltro(
  condicion: string,
): ResumenReporteDataflow["filtros"][number] | undefined {
  const coincidencia = condicion.match(
    /^\s*\[?([^\]]+?)\]?\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*(.+?)\s*$/i,
  );
  if (!coincidencia) return undefined;
  const campo = coincidencia[1]?.trim();
  const operador = coincidencia[2]?.toUpperCase();
  const valorCrudo = coincidencia[3]?.trim();
  if (!campo || !operador || !valorCrudo) return undefined;
  const esParametro = /\$\([^)]+\)/.test(valorCrudo);
  const valorPredeterminado = esParametro
    ? undefined
    : valorCrudo.replace(/^['"]|['"]$/g, "");
  return {
    etiqueta: crearEtiquetaFiltro(campo, operador),
    campo,
    operador,
    ...(valorPredeterminado ? { valorPredeterminado } : {}),
    obligatorio: esParametro,
  };
}

function detectarRangoTemporal(
  filtros: ResumenReporteDataflow["filtros"],
): ResumenReporteDataflow["rangoTemporal"] | undefined {
  const fechas = filtros.filter((filtro) => esCampoFecha(filtro.campo));
  if (fechas.length === 0) return undefined;
  const campo = fechas[0]?.campo;
  if (!campo) return undefined;
  const relacionados = fechas.filter((filtro) => filtro.campo === campo);
  const inicial = relacionados.find((filtro) =>
    [">", ">="].includes(filtro.operador),
  );
  const final = relacionados.find((filtro) =>
    ["<", "<="].includes(filtro.operador),
  );
  const igualdad = relacionados.find((filtro) => filtro.operador === "=");
  return {
    campo,
    ...((inicial?.valorPredeterminado ?? igualdad?.valorPredeterminado)
      ? {
          fechaInicial:
            inicial?.valorPredeterminado ?? igualdad?.valorPredeterminado,
        }
      : {}),
    ...((final?.valorPredeterminado ?? igualdad?.valorPredeterminado)
      ? {
          fechaFinal:
            final?.valorPredeterminado ?? igualdad?.valorPredeterminado,
        }
      : {}),
  };
}

function generarDescripcion(
  plan: PlanDataflow,
  cantidadFiltros: number,
): string {
  const fuente = plan.fuentes[0]?.tabla;
  const origen = fuente
    ? humanizar(fuente.split(".").at(-1) ?? fuente)
    : "la fuente configurada";
  const campos = plan.salida.campos.length;
  return `Reporte basado en ${origen} que devuelve ${campos} ${campos === 1 ? "campo" : "campos"}${
    cantidadFiltros > 0
      ? ` y aplica ${cantidadFiltros} ${cantidadFiltros === 1 ? "filtro" : "filtros"}`
      : " sin filtros detectados"
  }.`;
}

function crearEtiquetaFiltro(campo: string, operador: string): string {
  const sufijo =
    operador === ">=" || operador === ">"
      ? "desde"
      : operador === "<=" || operador === "<"
        ? "hasta"
        : "";
  return `${humanizar(campo)}${sufijo ? ` ${sufijo}` : ""}`;
}

function inferirTipo(
  expresion: string,
  alias: string,
): "texto" | "numero" | "fecha" | "fecha_hora" | undefined {
  const texto = `${expresion} ${alias}`;
  if (/Timestamp\s*\(|timestamp|fecha.?hora/i.test(texto)) return "fecha_hora";
  if (/Date\s*\(|\bfecha\b|\bdate\b/i.test(texto)) return "fecha";
  if (
    /\b(Sum|Count|Min|Max|Avg|Round|Floor|Ceil|Year|Month)\s*\(/i.test(
      expresion,
    )
  )
    return "numero";
  if (/\b(Upper|Lower|Trim)\s*\(/i.test(expresion)) return "texto";
  return undefined;
}

function esCampoFecha(campo: string): boolean {
  return /fecha|date|timestamp|a[nñ]o|year|mes|month|d[ií]a|day/i.test(campo);
}

function humanizar(valor: string): string {
  const texto = valor
    .replace(/[\[\]`]/g, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : valor;
}

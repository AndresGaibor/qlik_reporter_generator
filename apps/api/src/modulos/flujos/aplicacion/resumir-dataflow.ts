import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
import { compilarDataflowVNext } from "../../reportes/aplicacion/compilador-vnext/index.js";
import { ErrorCompilacionVNext } from "../../reportes/aplicacion/compilador-vnext/modelo.js";
import type { DiagnosticoVNext } from "../../reportes/aplicacion/compilador-vnext/modelo.js";
import { localizarComponenteDataflow } from "../../reportes/aplicacion/contexto-diagnostico-dataflow.js";
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
      fuentes: [],
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
  const fuentes = plan.fuentes.map((item, indice) => {
    const partes = item.tabla.split(".");
    return {
      nombre: humanizar(partes.at(-1) ?? item.tabla),
      tabla: item.tabla,
      ...(partes.length >= 2 ? { dataset: partes.at(-2) } : {}),
      principal: indice === 0,
    };
  });
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
    fuentes,
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
      const advertencia = construirAdvertenciaLegible(error.diagnostic, script);
      return { compatible: false, advertencias: [advertencia] };
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

/**
 * Convierte un diagnóstico técnico del compilador vNext en un mensaje accionable
 * para el usuario, indicando qué componente del Dataflow debe revisar y cómo.
 */
function construirAdvertenciaLegible(
  diagnostico: DiagnosticoVNext,
  script: string,
): string {
  const { code, snippet } = diagnostico;
  const componenteExacto = localizarComponenteDataflow(script, diagnostico);

  const componentePorCodigo: Record<string, string> = {
    SYNTAX_INVALID_IF: 'componente "Bifurcación" (IF … THEN … END IF)',
    SYNTAX_UNTERMINATED_IF:
      'componente "Bifurcación" al que le falta el cierre END IF',
    SYNTAX_INVALID_ELSEIF: 'componente "Bifurcación" (ELSEIF … THEN)',
    SYNTAX_INVALID_SWITCH: 'componente "Switch" (SWITCH … END SWITCH)',
    SYNTAX_UNTERMINATED_SWITCH:
      'componente "Switch" al que le falta el cierre END SWITCH',
    SYNTAX_SWITCH_CASE_EXPECTED:
      'componente "Switch" (se esperaba CASE, DEFAULT o END SWITCH)',
    SYNTAX_INVALID_FOR: 'componente "Bucle FOR" (FOR … TO … NEXT)',
    SYNTAX_UNTERMINATED_FOR:
      'componente "Bucle FOR" al que le falta el cierre NEXT',
    SYNTAX_FOR_COUNTER_MISMATCH:
      'componente "Bucle FOR" cuyo NEXT no coincide con la variable de inicio',
    SYNTAX_INVALID_DO: 'componente "Bucle DO … LOOP"',
    SYNTAX_UNTERMINATED_DO:
      'componente "Bucle DO" al que le falta el cierre LOOP',
    SYNTAX_INVALID_LOOP:
      'componente "Bucle DO … LOOP" (cláusula LOOP inválida)',
    SYNTAX_DO_TWO_CONDITIONS:
      'componente "Bucle DO … LOOP" (tiene condición en DO y en LOOP a la vez)',
    SYNTAX_INVALID_SUB: 'componente "Subrutina" (SUB … END SUB)',
    SYNTAX_UNTERMINATED_SUB:
      'componente "Subrutina" al que le falta el cierre END SUB',
    SYNTAX_INVALID_SUB_PARAMETER:
      'componente "Subrutina" (uno de sus parámetros tiene un nombre inválido)',
    SYNTAX_UNEXPECTED_CONTROL_CLAUSE:
      "cláusula de control inesperada (ELSEIF, ELSE o ENDIF fuera de un IF)",
    APPLYMAP_MAPPING_NOT_FOUND:
      "función ApplyMap que referencia una tabla MAPPING no encontrada",
    APPLYMAP_MAPPING_NAME_LITERAL_REQUIRED:
      "función ApplyMap (el primer argumento debe ser un nombre literal de tabla)",
    APPLYMAP_ARITY: "función ApplyMap con número de argumentos incorrecto",
    APPLYMAP_REQUIRES_TYPED_DUAL_LOWERING:
      "función ApplyMap (requiere una tabla MAPPING cargada con MAPPING LOAD)",
  };

  const nombreComponente = componentePorCodigo[code];

  const lineasSnippet = snippet
    ? snippet
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" / ")
    : null;

  const parteSnippet = lineasSnippet
    ? ` El fragmento afectado es: "${lineasSnippet}".`
    : "";

  if (componenteExacto) {
    return `El Dataflow contiene el componente "${componenteExacto}" que la plataforma aún no puede compilar: ${diagnostico.message}.${parteSnippet} Ábrelo en Qlik Cloud, localiza ese componente y corrígelo. Luego pulsa "Actualizar" aquí.`;
  }

  if (nombreComponente) {
    return `El Dataflow contiene ${nombreComponente} que la plataforma aún no puede compilar.${parteSnippet} Ábrelo en Qlik Cloud, localiza ese paso y simplifica o elimina la lógica de control. Luego pulsa "Actualizar" aquí.`;
  }

  // Fallback: include the raw diagnostic message which contains the function/operation name.
  return `El Dataflow contiene un paso que la plataforma aún no puede compilar: ${diagnostico.message}.${parteSnippet} Ábrelo en Qlik Cloud, localiza ese paso y corrígelo. Luego pulsa "Actualizar" aquí.`;
}

// El localizador del componente se comparte con el preflight.

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
    fuentes: [],
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
  const fechaFinal = final?.valorPredeterminado
    ? final.operador === "<"
      ? desplazarFechaCalendario(final.valorPredeterminado, -1)
      : final.valorPredeterminado
    : igualdad?.valorPredeterminado;
  return {
    campo,
    ...((inicial?.valorPredeterminado ?? igualdad?.valorPredeterminado)
      ? {
          fechaInicial:
            inicial?.valorPredeterminado ?? igualdad?.valorPredeterminado,
        }
      : {}),
    ...(fechaFinal ? { fechaFinal } : {}),
  };
}

function desplazarFechaCalendario(valor: string, dias: number): string {
  const iso = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const qlik = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !qlik) return valor;

  const year = Number(iso?.[1] ?? qlik?.[3]);
  const month = Number(iso?.[2] ?? qlik?.[1]);
  const day = Number(iso?.[3] ?? qlik?.[2]);
  const fecha = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.getUTCFullYear() !== year ||
    fecha.getUTCMonth() !== month - 1 ||
    fecha.getUTCDate() !== day
  ) {
    return valor;
  }

  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const yyyy = fecha.getUTCFullYear();
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
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
    .map((paso) => proyectarFiltro(paso.condicion))
    .filter((filtro) => filtro !== undefined);
  const advertenciasParser = plan.operacionesNoSoportadas.map((item) =>
    presentarOperacionNoSoportada(item.operacion, item.detalle),
  );
  const advertencias = eliminarDuplicados(
    [
      ...(entrada.erroresQlik ?? []),
      ...(entrada.advertenciasQlik ?? []),
      ...advertenciasParser,
    ].map(limpiarDetalleTecnico),
  );
  const fuente = plan.fuentes[0];
  const partesTabla = fuente?.tabla.split(".") ?? [];
  const estado =
    (entrada.erroresQlik?.length ?? 0) > 0 ||
    plan.operacionesNoSoportadas.length > 0
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

function presentarOperacionNoSoportada(
  operacion: string,
  detalle: string,
): string {
  if (/unknown statement|sentencia qlik no soportada/i.test(detalle)) {
    return "Hay un paso del Dataflow que todavía no podemos interpretar. Revisa el diseño en Qlik Cloud.";
  }
  return `El paso “${humanizar(operacion)}” requiere revisión: ${detalle}`;
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

import type {
  CampoDataflow,
  DialectoExpresion,
  FuenteBigQuery,
  OperacionNoSoportada,
  OrdenDataflow,
  PasoDataflow,
  PlanDataflow,
} from "../dominio/plan-dataflow.js";

const FUNCIONES_QLIK_SOPORTADAS = new Set([
  "Upper", "Lower", "Trim", "Len", "Year", "Month", "If", "Num", "Date",
  "Timestamp", "Sum", "Count", "Min", "Max", "Avg", "IsNull", "Round",
  "Floor", "Ceil",
]);

interface CargaPendiente {
  etiqueta?: string;
  join?: { tipo: "inner" | "left" | "right" | "full"; objetivo: string };
  campos: CampoDataflow[];
  distinct: boolean;
}

interface SelectSql {
  tabla: string;
  campos: CampoDataflow[];
  where?: string;
  agrupacion: string[];
  orden: OrdenDataflow[];
  distinct: boolean;
}

export function parsearDataflow(script: string): PlanDataflow {
  const fuentes: FuenteBigQuery[] = [];
  const pasos: PasoDataflow[] = [];
  const operacionesNoSoportadas: OperacionNoSoportada[] = [];
  const camposPorTabla = new Map<string, string[]>();
  const tablasActivas = new Set<string>();
  const tablasUsuario: string[] = [];
  let conexionActual: string | undefined;
  let cargaPendiente: CargaPendiente | undefined;
  let secuencia = 0;

  const nombreInterno = (prefijo: string) => `__${prefijo}_${++secuencia}`;
  const registrarTabla = (nombre: string, campos: string[], usuario = true) => {
    camposPorTabla.set(nombre, campos);
    tablasActivas.add(nombre);
    if (usuario && !tablasUsuario.includes(nombre)) tablasUsuario.push(nombre);
  };

  for (const sentenciaOriginal of dividirSentencias(limpiarScript(script))) {
    const sentencia = sentenciaOriginal.trim();
    if (!sentencia) continue;

    const conexion = sentencia.match(/^LIB\s+CONNECT\s+TO\s+\[([^\]]+)\]/i);
    if (conexion) {
      conexionActual = conexion[1]?.trim();
      continue;
    }
    if (/^(SET|TRACE)\b/i.test(sentencia)) continue;
    if (/^LET\b/i.test(sentencia)) {
      operacionesNoSoportadas.push({
        operacion: "LET",
        detalle: "Las variables LET deben resolverse antes de compilar el Dataflow",
      });
      continue;
    }

    const drop = sentencia.match(/^DROP\s+TABLE\s+\[([^\]]+)\]/i);
    if (drop) {
      tablasActivas.delete(drop[1] ?? "");
      continue;
    }
    if (/^STORE\b/i.test(sentencia)) continue;

    if (/^(?:SQL\s+)?SELECT\b/i.test(sentencia)) {
      const select = parsearSelectSql(sentencia);
      if (!select) {
        operacionesNoSoportadas.push({ operacion: "SELECT", detalle: "SELECT BigQuery no reconocido" });
        cargaPendiente = undefined;
        continue;
      }
      if (!conexionActual || !/big\s*query/i.test(conexionActual)) {
        operacionesNoSoportadas.push({
          operacion: "FuenteNoBigQuery",
          detalle: `La conexión ${conexionActual ?? "sin conexión"} no es BigQuery`,
        });
      }

      const fuenteId = nombreInterno("fuente");
      fuentes.push({
        id: fuenteId,
        tipo: "bigquery",
        conexion: conexionActual,
        tabla: select.tabla,
        campos: select.campos,
        distinct: select.distinct,
        agrupacion: select.agrupacion,
        orden: select.orden,
      });
      let relacion = fuenteId;
      camposPorTabla.set(relacion, select.campos.map((campo) => campo.alias));

      if (select.where) {
        const filtrada = nombreInterno("filtro_sql");
        pasos.push({
          tipo: "filtrar",
          entrada: relacion,
          salida: filtrada,
          condicion: select.where,
          dialecto: "bigquery",
        });
        camposPorTabla.set(filtrada, camposPorTabla.get(relacion) ?? []);
        relacion = filtrada;
      }

      if (cargaPendiente) {
        relacion = aplicarCarga(
          cargaPendiente,
          relacion,
          camposPorTabla,
          pasos,
          operacionesNoSoportadas,
          registrarTabla,
          nombreInterno,
        );
        cargaPendiente = undefined;
      } else {
        registrarTabla(relacion, camposPorTabla.get(relacion) ?? [], false);
      }
      continue;
    }

    if (/\bLOAD\b/i.test(sentencia)) {
      const carga = parsearCarga(sentencia, operacionesNoSoportadas);
      if (!carga) {
        operacionesNoSoportadas.push({ operacion: "LOAD", detalle: "LOAD no reconocido" });
        continue;
      }

      if (carga.resident) {
        const pendiente: CargaPendiente = {
          etiqueta: carga.etiqueta,
          join: carga.join,
          campos: carga.campos,
          distinct: carga.distinct,
        };
        let relacion = carga.resident;
        if (carga.where) {
          const filtrada = nombreInterno("filtro_qlik");
          pasos.push({
            tipo: "filtrar",
            entrada: relacion,
            salida: filtrada,
            condicion: carga.where,
            dialecto: "qlik",
          });
          camposPorTabla.set(filtrada, camposPorTabla.get(relacion) ?? []);
          relacion = filtrada;
        }
        const salida = aplicarCarga(
          pendiente,
          relacion,
          camposPorTabla,
          pasos,
          operacionesNoSoportadas,
          registrarTabla,
          nombreInterno,
          carga.agrupacion,
          carga.orden,
        );
        if (carga.orden.length > 0 && salida) {
          const ordenada = carga.join ? nombreInterno("orden") : salida;
          pasos.push({ tipo: "ordenar", entrada: salida, salida: ordenada, campos: carga.orden });
          camposPorTabla.set(ordenada, camposPorTabla.get(salida) ?? []);
          if (!carga.join && carga.etiqueta) registrarTabla(carga.etiqueta, camposPorTabla.get(ordenada) ?? []);
        }
      } else {
        cargaPendiente = {
          etiqueta: carga.etiqueta,
          join: carga.join,
          campos: carga.campos,
          distinct: carga.distinct,
        };
      }
      continue;
    }

    operacionesNoSoportadas.push({
      operacion: primeraPalabra(sentencia),
      detalle: "Sentencia Qlik no soportada",
      contexto: sentencia.slice(0, 160),
    });
  }

  if (cargaPendiente) {
    operacionesNoSoportadas.push({ operacion: "LOAD", detalle: "LOAD sin SELECT o RESIDENT asociado" });
  }

  const tablaSalida = [...tablasUsuario].reverse().find((tabla) => tablasActivas.has(tabla))
    ?? [...tablasUsuario].reverse()[0]
    ?? fuentes.at(-1)?.id
    ?? "";

  return {
    fuentes,
    pasos,
    salida: { tablaLogica: tablaSalida, campos: camposPorTabla.get(tablaSalida) ?? [] },
    operacionesNoSoportadas,
  };
}

function aplicarCarga(
  carga: CargaPendiente,
  entrada: string,
  camposPorTabla: Map<string, string[]>,
  pasos: PasoDataflow[],
  noSoportadas: OperacionNoSoportada[],
  registrarTabla: (nombre: string, campos: string[], usuario?: boolean) => void,
  nombreInterno: (prefijo: string) => string,
  agrupacion: string[] = [],
  _orden: OrdenDataflow[] = [],
): string {
  const salidaProyeccion = carga.join ? nombreInterno("join_derecha") : (carga.etiqueta ?? nombreInterno("carga"));
  pasos.push({
    tipo: "proyectar",
    entrada,
    salida: salidaProyeccion,
    campos: carga.campos,
    distinct: carga.distinct,
    agrupacion,
    dialecto: "qlik",
  });
  const camposSalida = carga.campos.map((campo) => campo.alias);
  camposPorTabla.set(salidaProyeccion, camposSalida);

  if (!carga.join) {
    registrarTabla(salidaProyeccion, camposSalida, Boolean(carga.etiqueta));
    return salidaProyeccion;
  }

  const camposIzquierda = camposPorTabla.get(carga.join.objetivo) ?? [];
  const claves = camposIzquierda.filter((campo) => camposSalida.includes(campo));
  if (claves.length === 0) {
    noSoportadas.push({
      operacion: "JOIN",
      detalle: `No se encontraron campos comunes para unir ${carga.join.objetivo}`,
    });
  }
  pasos.push({
    tipo: "join",
    join: carga.join.tipo,
    izquierda: carga.join.objetivo,
    derecha: salidaProyeccion,
    salida: carga.join.objetivo,
    claves,
  });
  registrarTabla(
    carga.join.objetivo,
    [...camposIzquierda, ...camposSalida.filter((campo) => !camposIzquierda.includes(campo))],
  );
  return carga.join.objetivo;
}

function parsearCarga(sentencia: string, noSoportadas: OperacionNoSoportada[]) {
  let texto = sentencia.trim();
  let etiqueta: string | undefined;
  const matchEtiqueta = texto.match(/^\[([^\]]+)\]\s*:\s*/);
  if (matchEtiqueta) {
    etiqueta = matchEtiqueta[1]?.trim();
    texto = texto.slice(matchEtiqueta[0].length).trim();
  }

  let join: CargaPendiente["join"];
  const matchJoin = texto.match(/^(?:(INNER|LEFT|RIGHT|FULL)\s+)?JOIN\s*\(\s*\[([^\]]+)\]\s*\)\s*/i);
  if (matchJoin) {
    join = {
      tipo: ((matchJoin[1] ?? "inner").toLowerCase()) as "inner" | "left" | "right" | "full",
      objetivo: matchJoin[2]?.trim() ?? "",
    };
    texto = texto.slice(matchJoin[0].length).trim();
  }

  texto = texto.replace(/^NOCONCATENATE\s+/i, "");
  const indiceLoad = texto.search(/\bLOAD\b/i);
  if (indiceLoad < 0) return undefined;
  texto = texto.slice(indiceLoad + 4).trim();
  const distinct = /^DISTINCT\b/i.test(texto);
  if (distinct) texto = texto.replace(/^DISTINCT\b/i, "").trim();

  const residentMatch = texto.match(/\bRESIDENT\s+\[([^\]]+)\]/i);
  const cuerpoCampos = residentMatch ? texto.slice(0, residentMatch.index).trim() : texto;
  const campos = parsearCampos(cuerpoCampos, "qlik");
  detectarFuncionesNoSoportadas(campos.map((campo) => campo.expresion), noSoportadas);

  let where: string | undefined;
  let agrupacion: string[] = [];
  let orden: OrdenDataflow[] = [];
  if (residentMatch) {
    const despues = texto.slice((residentMatch.index ?? 0) + residentMatch[0].length);
    where = extraerClausula(despues, "WHERE", ["GROUP BY", "ORDER BY"]);
    const grupo = extraerClausula(despues, "GROUP BY", ["ORDER BY"]);
    agrupacion = grupo ? dividirLista(grupo) : [];
    const ordenRaw = extraerClausula(despues, "ORDER BY", []);
    orden = ordenRaw ? parsearOrden(ordenRaw, "qlik") : [];
    if (where) detectarFuncionesNoSoportadas([where], noSoportadas);
  }

  return {
    etiqueta,
    join,
    campos,
    distinct,
    resident: residentMatch?.[1]?.trim(),
    where,
    agrupacion,
    orden,
  };
}

function parsearSelectSql(sentencia: string): SelectSql | undefined {
  const match = sentencia.match(/^(?:SQL\s+)?SELECT\s+([\s\S]+?)\s+FROM\s+(`[^`]+`|\[[^\]]+\]|(?:"[^"]+"\s*\.\s*){1,2}"[^"]+"|[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2})([\s\S]*)$/i);
  if (!match) return undefined;
  let lista = match[1]?.trim() ?? "";
  const distinct = /^DISTINCT\b/i.test(lista);
  if (distinct) lista = lista.replace(/^DISTINCT\b/i, "").trim();
  const resto = match[3] ?? "";
  const where = extraerClausula(resto, "WHERE", ["GROUP BY", "ORDER BY"]);
  const grupo = extraerClausula(resto, "GROUP BY", ["ORDER BY"]);
  const ordenRaw = extraerClausula(resto, "ORDER BY", []);
  return {
    tabla: normalizarTabla(match[2] ?? ""),
    campos: parsearCampos(lista, "bigquery"),
    where,
    agrupacion: grupo ? dividirLista(grupo) : [],
    orden: ordenRaw ? parsearOrden(ordenRaw, "bigquery") : [],
    distinct,
  };
}

function parsearCampos(texto: string, dialecto: DialectoExpresion): CampoDataflow[] {
  return dividirLista(texto).filter(Boolean).map((parte) => {
    const alias = parte.match(/\s+AS\s+\[([^\]]+)\]\s*$/i)
      ?? parte.match(/\s+AS\s+`([^`]+)`\s*$/i)
      ?? parte.match(/\s+AS\s+([A-Za-z_][\w]*)\s*$/i);
    const expresion = alias ? parte.slice(0, alias.index).trim() : parte.trim();
    return {
      expresion,
      alias: alias?.[1]?.trim() ?? nombreCampo(expresion),
      dialecto,
    };
  });
}

function parsearOrden(texto: string, dialecto: DialectoExpresion): OrdenDataflow[] {
  return dividirLista(texto).map((parte) => {
    const match = parte.match(/^(.*?)(?:\s+(ASC|DESC))?$/i);
    return {
      expresion: match?.[1]?.trim() ?? parte.trim(),
      direccion: (match?.[2]?.toLowerCase() === "desc" ? "desc" : "asc") as "asc" | "desc",
      dialecto,
    };
  });
}

function detectarFuncionesNoSoportadas(expresiones: string[], salida: OperacionNoSoportada[]) {
  for (const expresion of expresiones) {
    for (const match of expresion.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      const funcion = match[1] ?? "";
      if (!FUNCIONES_QLIK_SOPORTADAS.has(funcion) && !salida.some((item) => item.operacion === funcion)) {
        salida.push({ operacion: funcion, detalle: `Función Qlik no soportada: ${funcion}`, contexto: expresion });
      }
    }
  }
}

function limpiarScript(script: string): string {
  return script.replace(/^\uFEFF/, "").split(/\r?\n/)
    .filter((linea) => !linea.trimStart().startsWith("//"))
    .join("\n");
}

function dividirSentencias(script: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let comilla: "'" | '"' | "`" | undefined;
  for (let i = 0; i < script.length; i += 1) {
    const caracter = script[i] ?? "";
    const previo = script[i - 1] ?? "";
    if ((caracter === "'" || caracter === '"' || caracter === "`") && previo !== "\\") {
      if (!comilla) comilla = caracter as "\'" | '"' | "`";
      else if (comilla === caracter) comilla = undefined;
    }
    if (caracter === ";" && !comilla) {
      if (actual.trim()) salida.push(actual.trim());
      actual = "";
    } else actual += caracter;
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

function dividirLista(texto: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let profundidad = 0;
  let comilla: string | undefined;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i] ?? "";
    const previo = texto[i - 1] ?? "";
    if ((c === "'" || c === '"' || c === "`") && previo !== "\\") {
      if (!comilla) comilla = c;
      else if (comilla === c) comilla = undefined;
    }
    if (!comilla) {
      if (c === "(") profundidad += 1;
      if (c === ")") profundidad = Math.max(0, profundidad - 1);
      if (c === "," && profundidad === 0) {
        partes.push(actual.trim());
        actual = "";
        continue;
      }
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

function extraerClausula(texto: string, inicio: string, finales: string[]): string | undefined {
  const indice = buscarPalabra(texto, inicio);
  if (indice < 0) return undefined;
  const desde = indice + inicio.length;
  let hasta = texto.length;
  for (const final of finales) {
    const encontrado = buscarPalabra(texto, final, desde);
    if (encontrado >= 0 && encontrado < hasta) hasta = encontrado;
  }
  return texto.slice(desde, hasta).trim() || undefined;
}

function buscarPalabra(texto: string, palabra: string, desde = 0): number {
  const patron = new RegExp(`\\b${palabra.replace(/\s+/g, "\\s+")}\\b`, "ig");
  patron.lastIndex = desde;
  return patron.exec(texto)?.index ?? -1;
}

function normalizarTabla(tabla: string): string {
  const limpia = tabla.trim().replace(/^`|`$/g, "").replace(/^\[|\]$/g, "");
  return limpia.replace(/"\s*\.\s*"/g, ".").replace(/^"|"$/g, "");
}

function nombreCampo(expresion: string): string {
  const bracket = expresion.match(/^\[([^\]]+)\]$/);
  if (bracket?.[1]) return bracket[1];
  const tick = expresion.match(/^`([^`]+)`$/);
  if (tick?.[1]) return tick[1].split(".").at(-1) ?? tick[1];
  const simple = expresion.trim().split(".").at(-1)?.replace(/^["`\[]|["`\]]$/g, "");
  return simple || expresion.trim();
}

function primeraPalabra(sentencia: string): string {
  return sentencia.match(/^([A-Za-z_]+)/)?.[1] ?? "DESCONOCIDA";
}

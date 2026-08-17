import {
  ErrorDataflowNoCompatible,
  type CampoDataflow,
  type DialectoExpresion,
  type OrdenDataflow,
  type PlanDataflow,
} from "../dominio/plan-dataflow.js";

interface RelacionCompilada {
  cte: string;
  campos: string[];
  ordenFinal?: string;
}

export function compilarPlanABigQuery(
  plan: PlanDataflow,
): { sql: string; camposSalida: string[] } {
  if (plan.operacionesNoSoportadas.length > 0) {
    throw new ErrorDataflowNoCompatible(plan.operacionesNoSoportadas);
  }
  if (plan.fuentes.length === 0) {
    throw new ErrorDataflowNoCompatible([
      { operacion: "Fuente", detalle: "El Dataflow no contiene fuentes BigQuery" },
    ]);
  }

  const ctes: string[] = [];
  const relaciones = new Map<string, RelacionCompilada>();
  let indiceCte = 0;
  const nuevaCte = (prefijo: string) => `${prefijo}_${++indiceCte}`;

  for (const fuente of plan.fuentes) {
    const cte = nuevaCte("fuente");
    const tabla = citarTablaBigQuery(fuente.tabla);
    const campos = fuente.campos.map(compilarCampo).join(",\n      ");
    const distinct = fuente.distinct ? "DISTINCT " : "";
    const groupBy = fuente.agrupacion?.length
      ? `\n    GROUP BY ${fuente.agrupacion.map((item) => traducirExpresion(item, "bigquery")).join(", ")}`
      : "";
    const orderBy = fuente.orden?.length
      ? `\n    ORDER BY ${compilarOrden(fuente.orden)}`
      : "";
    ctes.push(
      `${cte} AS (\n    SELECT ${distinct}${campos}\n    FROM ${tabla}${groupBy}${orderBy}\n  )`,
    );
    relaciones.set(fuente.id, {
      cte,
      campos: fuente.campos.map((campo) => campo.alias),
      ...(fuente.orden?.length ? { ordenFinal: compilarOrden(fuente.orden) } : {}),
    });
  }

  for (const paso of plan.pasos) {
    if (paso.tipo === "filtrar") {
      const entrada = obtenerRelacion(relaciones, paso.entrada);
      const cte = nuevaCte("filtro");
      ctes.push(
        `${cte} AS (\n    SELECT *\n    FROM ${entrada.cte}\n    WHERE ${traducirExpresion(
          paso.condicion,
          paso.dialecto,
          paso.formatoFechaQlik,
        )}\n  )`,
      );
      relaciones.set(paso.salida, { cte, campos: entrada.campos });
      continue;
    }

    if (paso.tipo === "proyectar") {
      const entrada = obtenerRelacion(relaciones, paso.entrada);
      const cte = nuevaCte("proyeccion");
      const distinct = paso.distinct ? "DISTINCT " : "";
      const campos = paso.campos.map(compilarCampo).join(",\n      ");
      const groupBy = paso.agrupacion.length
        ? `\n    GROUP BY ${paso.agrupacion.map((item) => traducirExpresion(item, paso.dialecto)).join(", ")}`
        : "";
      ctes.push(
        `${cte} AS (\n    SELECT ${distinct}${campos}\n    FROM ${entrada.cte}${groupBy}\n  )`,
      );
      relaciones.set(paso.salida, {
        cte,
        campos: paso.campos.map((campo) => campo.alias),
      });
      continue;
    }

    if (paso.tipo === "ordenar") {
      const entrada = obtenerRelacion(relaciones, paso.entrada);
      const cte = nuevaCte("orden");
      const orden = compilarOrden(paso.campos);
      ctes.push(
        `${cte} AS (\n    SELECT *\n    FROM ${entrada.cte}\n    ORDER BY ${orden}\n  )`,
      );
      relaciones.set(paso.salida, { cte, campos: entrada.campos, ordenFinal: orden });
      continue;
    }

    if (paso.tipo === "join") {
      const izquierda = obtenerRelacion(relaciones, paso.izquierda);
      const derecha = obtenerRelacion(relaciones, paso.derecha);
      if (paso.claves.length === 0) {
        throw new ErrorDataflowNoCompatible([
          { operacion: "JOIN", detalle: "Un JOIN requiere al menos una clave común" },
        ]);
      }
      const cte = nuevaCte("join");
      const tipoJoin = `${paso.join.toUpperCase()} JOIN`;
      const camposDerecha = derecha.campos.filter(
        (campo) => !izquierda.campos.includes(campo),
      );
      const seleccion = [
        ...izquierda.campos.map((campo) => `l.${citarIdentificador(campo)} AS ${citarIdentificador(campo)}`),
        ...camposDerecha.map((campo) => `r.${citarIdentificador(campo)} AS ${citarIdentificador(campo)}`),
      ].join(",\n      ");
      const condicion = paso.claves
        .map((clave) => `l.${citarIdentificador(clave)} = r.${citarIdentificador(clave)}`)
        .join(" AND ");
      ctes.push(
        `${cte} AS (\n    SELECT ${seleccion}\n    FROM ${izquierda.cte} AS l\n    ${tipoJoin} ${derecha.cte} AS r ON ${condicion}\n  )`,
      );
      relaciones.set(paso.salida, {
        cte,
        campos: [...izquierda.campos, ...camposDerecha],
      });
    }
  }

  const salida = obtenerRelacion(relaciones, plan.salida.tablaLogica);
  const camposSalida = plan.salida.campos.length > 0 ? plan.salida.campos : salida.campos;
  const seleccionFinal = camposSalida.length > 0
    ? camposSalida.map(citarIdentificador).join(", ")
    : "*";
  const ordenFinal = salida.ordenFinal ? `\nORDER BY ${salida.ordenFinal}` : "";
  return {
    sql: `WITH\n  ${ctes.join(",\n  ")}\nSELECT ${seleccionFinal}\nFROM ${salida.cte}${ordenFinal}`,
    camposSalida,
  };
}

function obtenerRelacion(
  relaciones: Map<string, RelacionCompilada>,
  nombre: string,
): RelacionCompilada {
  const relacion = relaciones.get(nombre);
  if (!relacion) {
    throw new ErrorDataflowNoCompatible([
      { operacion: "Referencia", detalle: `No existe la relación ${nombre}` },
    ]);
  }
  return relacion;
}

function compilarCampo(campo: CampoDataflow): string {
  return `${traducirExpresion(campo.expresion, campo.dialecto)} AS ${citarIdentificador(campo.alias)}`;
}

function compilarOrden(campos: OrdenDataflow[]): string {
  return campos
    .map(
      (campo) =>
        `${traducirExpresion(campo.expresion, campo.dialecto)} ${campo.direccion.toUpperCase()}`,
    )
    .join(", ");
}

export function traducirExpresion(
  expresion: string,
  dialecto: DialectoExpresion,
  formatoFechaQlik?: string,
): string {
  if (dialecto === "bigquery") return expresion.trim();
  let resultado = traducirFunciones(expresion.trim());
  resultado = traducirLiteralesFechaQlik(resultado, formatoFechaQlik);
  resultado = resultado.replace(/\[([^\]]+)\]/g, (_match, nombre: string) =>
    citarIdentificador(nombre),
  );
  resultado = reemplazarFueraDeComillas(resultado, "<>", "!=");
  resultado = reemplazarAmpersand(resultado);
  return resultado;
}

function traducirLiteralesFechaQlik(
  texto: string,
  formatoFechaQlik?: string,
): string {
  if (!formatoFechaQlik) return texto;
  if (formatoFechaQlik.toUpperCase() !== "M/D/YYYY") return texto;
  return texto.replace(
    /'([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})'/g,
    (_match, mes: string, dia: string, anio: string) => {
      const mesNumero = Number(mes);
      const diaNumero = Number(dia);
      const anioNumero = Number(anio);
      const fecha = new Date(Date.UTC(anioNumero, mesNumero - 1, diaNumero));
      if (
        fecha.getUTCFullYear() !== anioNumero ||
        fecha.getUTCMonth() !== mesNumero - 1 ||
        fecha.getUTCDate() !== diaNumero
      ) {
        return _match;
      }
      return `DATE '${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}'`;
    },
  );
}

function traducirFunciones(texto: string): string {
  let salida = "";
  let i = 0;
  while (i < texto.length) {
    const inicio = i;
    if (!/[A-Za-z_]/.test(texto[i] ?? "")) {
      salida += texto[i] ?? "";
      i += 1;
      continue;
    }
    i += 1;
    while (i < texto.length && /[A-Za-z0-9_]/.test(texto[i] ?? "")) i += 1;
    const nombre = texto.slice(inicio, i);
    if (nombre.toUpperCase() === "IN") {
      salida += nombre;
      continue;
    }
    let cursor = i;
    while (cursor < texto.length && /\s/.test(texto[cursor] ?? "")) cursor += 1;
    if (texto[cursor] !== "(") {
      salida += texto.slice(inicio, i);
      continue;
    }
    const cierre = encontrarCierreParentesis(texto, cursor);
    if (cierre < 0) {
      throw new ErrorDataflowNoCompatible([
        { operacion: nombre, detalle: `Paréntesis sin cerrar en ${nombre}` },
      ]);
    }
    const argumentos = dividirArgumentos(texto.slice(cursor + 1, cierre)).map(traducirFunciones);
    salida += compilarFuncion(nombre, argumentos);
    i = cierre + 1;
  }
  return salida;
}

function compilarFuncion(nombreOriginal: string, args: string[]): string {
  const nombre = nombreOriginal.toLowerCase();
  const uno = () => {
    if (args.length !== 1) throw aridad(nombreOriginal, 1, args.length);
    return args[0] ?? "";
  };
  if (["upper", "lower", "trim", "sum", "count", "min", "max", "avg", "round", "floor"].includes(nombre)) {
    return `${nombre.toUpperCase()}(${args.join(", ")})`;
  }
  if (nombre === "len") return `LENGTH(${uno()})`;
  if (nombre === "ceil") return `CEIL(${uno()})`;
  if (nombre === "year") return `EXTRACT(YEAR FROM ${uno()})`;
  if (nombre === "month") return `EXTRACT(MONTH FROM ${uno()})`;
  if (nombre === "num") return `CAST(${uno()} AS NUMERIC)`;
  if (nombre === "date") return `CAST(${uno()} AS DATE)`;
  if (nombre === "timestamp") return `CAST(${uno()} AS TIMESTAMP)`;
  if (nombre === "isnull") return `(${uno()} IS NULL)`;
  if (nombre === "if") {
    if (args.length !== 3) throw aridad(nombreOriginal, 3, args.length);
    return `CASE WHEN ${args[0]} THEN ${args[1]} ELSE ${args[2]} END`;
  }
  throw new ErrorDataflowNoCompatible([
    { operacion: nombreOriginal, detalle: `Función Qlik no soportada: ${nombreOriginal}` },
  ]);
}

function aridad(nombre: string, esperada: number, recibida: number): ErrorDataflowNoCompatible {
  return new ErrorDataflowNoCompatible([
    { operacion: nombre, detalle: `${nombre} requiere ${esperada} argumentos y recibió ${recibida}` },
  ]);
}

function encontrarCierreParentesis(texto: string, apertura: number): number {
  let profundidad = 0;
  let comilla: string | undefined;
  for (let i = apertura; i < texto.length; i += 1) {
    const c = texto[i] ?? "";
    const previo = texto[i - 1] ?? "";
    if ((c === "'" || c === '"' || c === "`") && previo !== "\\") {
      if (!comilla) comilla = c;
      else if (comilla === c) comilla = undefined;
      continue;
    }
    if (comilla) continue;
    if (c === "(") profundidad += 1;
    else if (c === ")") {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

function dividirArgumentos(texto: string): string[] {
  const salida: string[] = [];
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
      else if (c === ")") profundidad -= 1;
      else if (c === "," && profundidad === 0) {
        salida.push(actual.trim());
        actual = "";
        continue;
      }
    }
    actual += c;
  }
  if (actual.trim() || texto.trim() === "") salida.push(actual.trim());
  return salida;
}

function reemplazarFueraDeComillas(texto: string, buscar: string, reemplazo: string): string {
  let salida = "";
  let comilla: string | undefined;
  for (let i = 0; i < texto.length;) {
    const c = texto[i] ?? "";
    const previo = texto[i - 1] ?? "";
    if ((c === "'" || c === '"' || c === "`") && previo !== "\\") {
      if (!comilla) comilla = c;
      else if (comilla === c) comilla = undefined;
      salida += c;
      i += 1;
      continue;
    }
    if (!comilla && texto.startsWith(buscar, i)) {
      salida += reemplazo;
      i += buscar.length;
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

function reemplazarAmpersand(texto: string): string {
  return reemplazarFueraDeComillas(texto, "&", "||");
}

function citarIdentificador(nombre: string): string {
  if (!nombre || nombre.includes("`")) {
    throw new ErrorDataflowNoCompatible([
      { operacion: "Identificador", detalle: `Identificador BigQuery inválido: ${nombre}` },
    ]);
  }
  return `\`${nombre}\``;
}

function citarTablaBigQuery(tabla: string): string {
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}$/.test(tabla)) {
    throw new ErrorDataflowNoCompatible([
      { operacion: "FuenteBigQuery", detalle: `Tabla BigQuery inválida: ${tabla}` },
    ]);
  }
  return `\`${tabla}\``;
}

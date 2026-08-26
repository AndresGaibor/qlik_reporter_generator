export const MAXIMO_FILAS_TALEND = 1_000_000;

export interface EntradaConsultasTalendBigQuery {
  sql: string;
  uriBase: string;
  projectId: string;
  dataset: string;
  ejecucionId: string;
  maximoFilasPorArchivo?: number;
  columnasOrden?: string[];
}

export interface ConsultasTalendBigQuery {
  sql: string;
  bqNumberCsv: string;
  bqExportData: string;
  jobId?: string;
  projectId?: string;
}

export function derivarJobId(ejecucionId: string): string {
  return `qlikr_${ejecucionId.replace(/-/g, "").slice(0, 24)}`;
}

export function construirConsultasTalendBigQuery({
  sql,
  uriBase,
  projectId,
  dataset,
  ejecucionId,
  maximoFilasPorArchivo = MAXIMO_FILAS_TALEND,
  columnasOrden = [],
}: EntradaConsultasTalendBigQuery): ConsultasTalendBigQuery {
  const sqlFuente = normalizarSqlFuente(sql);
  const uri = normalizarUriGcs(uriBase);
  validarIdentificadorGoogle(projectId, "proyecto");
  validarIdentificadorGoogle(dataset, "dataset");
  validarEjecucionId(ejecucionId);
  validarMaximoFilas(maximoFilasPorArchivo);
  const ventanaOrden = construirVentanaOrden(columnasOrden);
  const fuente = `source AS (\n  ${indentar(sqlFuente, 2)}\n)`;
  const sqlExportacion = `EXPORT DATA OPTIONS (\n  uri = '${uri}/parte-*.csv.gz',\n  format = 'CSV',\n  compression = 'GZIP',\n  overwrite = TRUE,\n  header = TRUE,\n  field_delimiter = '|'\n)\nAS\n${sqlFuente};`;
  const bqNumberCsv = `WITH ${fuente},
total AS (
  SELECT COUNT(*) AS total_rows
  FROM source
)
SELECT export_part
FROM total,
UNNEST(
  GENERATE_ARRAY(
    0,
    GREATEST(CAST(CEIL(total_rows / ${maximoFilasPorArchivo}.0) AS INT64), 1) - 1
  )
) AS export_part
ORDER BY export_part;`;

  const bqExportData = `EXPORT DATA OPTIONS(
  uri = '${uri}/parte-__PART_PADDED__-*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
WITH ${fuente},
numbered AS (
  SELECT
    source.*,
    ROW_NUMBER() OVER (${ventanaOrden}) AS export_row_number
  FROM source
)
SELECT * EXCEPT (export_row_number)
FROM numbered
WHERE export_row_number BETWEEN __START_ROW__ AND __END_ROW__
ORDER BY export_row_number;

IF __END_ROW__ >= (
  WITH ${fuente}
  SELECT COUNT(*)
  FROM source
) THEN
  EXPORT DATA OPTIONS(
    uri = '${uri}/__finalizado__-*.csv',
    format = 'CSV',
    overwrite = true,
    header = false
  ) AS
  SELECT 'ok' AS estado;
END IF;`;

  return {
    sql: sqlExportacion,
    bqNumberCsv,
    bqExportData,
    jobId: derivarJobId(ejecucionId),
    projectId,
  };
}

export function serializarConsultasTalend(
  consultas: ConsultasTalendBigQuery,
): string {
  return consultas.sql;
}

function normalizarSqlFuente(sql: string): string {
  const limpio = sql.trim().replace(/;\s*$/, "").trim();
  if (!limpio) throw new Error("El SQL fuente es obligatorio");
  if (limpio.includes(";"))
    throw new Error("El SQL fuente debe ser una sola consulta SELECT");
  if (!/^(WITH\b|SELECT\b)/i.test(limpio)) {
    throw new Error("El SQL fuente debe iniciar con SELECT o WITH");
  }
  return limpio;
}

function normalizarUriGcs(uriBase: string): string {
  const limpio = uriBase.trim().replace(/\/+$/, "");
  if (
    !/^gs:\/\/[a-z0-9][a-z0-9._-]{1,221}[a-z0-9](?:\/[^'\n\r]*)?$/i.test(limpio)
  ) {
    throw new Error(
      "El destino de exportación debe ser una URI GCS válida (gs://...)",
    );
  }
  return limpio;
}

function validarIdentificadorGoogle(valor: string, nombre: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(valor))
    throw new Error(`Identificador de ${nombre} inválido`);
}

function validarEjecucionId(valor: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      valor,
    )
  ) {
    throw new Error("El ID de ejecución no es un UUID válido");
  }
}

function validarMaximoFilas(valor: number): void {
  if (!Number.isInteger(valor) || valor < 1 || valor > MAXIMO_FILAS_TALEND) {
    throw new Error(
      "El máximo de filas por bloque debe estar entre 1 y 1.000.000",
    );
  }
}

function construirVentanaOrden(columnas: string[]): string {
  if (columnas.length === 0) return "";
  const seguras = columnas.map((columna) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(columna)) {
      throw new Error(`Columna de orden inválida: ${columna}`);
    }
    return `\`${columna}\``;
  });
  return `ORDER BY ${seguras.join(", ")}`;
}

function indentar(texto: string, espacios: number): string {
  const prefijo = " ".repeat(espacios);
  return texto
    .split("\n")
    .map((linea) => `${prefijo}${linea}`)
    .join("\n")
    .trimStart();
}

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
  bqSelectData: string;
  bqNumberCsv: string;
  bqExportData: string;
  bqDrop: string;
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
  const tabla = `\`${projectId}.${dataset}.__qlik_reportes_${ejecucionId.replaceAll("-", "_")}\``;

  const bqSelectData = `CREATE OR REPLACE TABLE ${tabla}
CLUSTER BY export_part AS
WITH source AS (
  ${indentar(sqlFuente, 2)}
),
numbered AS (
  SELECT
    source.*,
    ROW_NUMBER() OVER (${ventanaOrden}) AS export_row_number
  FROM source
)
SELECT
  numbered.*,
  DIV(export_row_number - 1, ${maximoFilasPorArchivo}) AS export_part
FROM numbered;`;

  const bqNumberCsv = `WITH source AS (
  ${indentar(sqlFuente, 2)}
),
params AS (
  SELECT
    CAST(CEIL(COUNT(*) / ${maximoFilasPorArchivo}.0) AS INT64) AS totalparts
  FROM source
)
SELECT DISTINCT export_part
FROM params,
UNNEST(GENERATE_ARRAY(0, totalparts - 1)) AS export_part
ORDER BY export_part;`;

  const bqExportData = `EXPORT DATA OPTIONS(
  uri = '${uri}/parte-__PART_PADDED__-*.csv.gz',
  format = 'CSV',
  compression = 'GZIP',
  overwrite = true,
  header = true,
  field_delimiter = '|'
) AS
WITH source AS (
  ${indentar(sqlFuente, 2)}
),
numbered AS (
  SELECT
    source.*,
    ROW_NUMBER() OVER (${ventanaOrden}) AS export_row_number
  FROM source
)
SELECT * EXCEPT (export_row_number)
FROM numbered
WHERE export_row_number BETWEEN __START_ROW__ AND __END_ROW__
ORDER BY export_row_number;`;

  const bqDrop = `DROP TABLE IF EXISTS ${tabla};`;

  return { bqSelectData, bqNumberCsv, bqExportData, bqDrop };
}

export function serializarConsultasTalend(
  consultas: ConsultasTalendBigQuery,
): string {
  return [
    "-- bq_select_data",
    consultas.bqSelectData,
    "",
    "-- bq_number_csv",
    consultas.bqNumberCsv,
    "",
    "-- bq_export_data",
    consultas.bqExportData,
    "",
    "-- bq_drop",
    consultas.bqDrop,
  ].join("\n");
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

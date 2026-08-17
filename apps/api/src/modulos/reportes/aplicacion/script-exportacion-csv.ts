export const MAXIMO_FILAS_EXCEL = 1_000_000;

export interface EntradaExportacionCsv {
  sql: string;
  uriBase: string;
  maximoFilasPorArchivo?: number;
  columnasOrden?: string[];
}

export function construirScriptExportacionCsv({
  sql,
  uriBase,
  maximoFilasPorArchivo = MAXIMO_FILAS_EXCEL,
  columnasOrden = [],
}: EntradaExportacionCsv): string {
  const sqlFuente = normalizarSqlFuente(sql);
  const uri = normalizarUriGcs(uriBase);
  validarMaximoFilas(maximoFilasPorArchivo);
  const ventanaOrden = construirVentanaOrden(columnasOrden);

  return `DECLARE max_rows INT64 DEFAULT ${maximoFilasPorArchivo};
DECLARE total_rows INT64 DEFAULT 0;
DECLARE num_parts INT64 DEFAULT 0;
DECLARE current_part INT64 DEFAULT 0;

CREATE TEMP TABLE export_rows
CLUSTER BY __reportes_export_part AS
WITH source AS (
  ${indentar(sqlFuente, 2)}
),
numbered AS (
  SELECT
    source.*,
    ROW_NUMBER() OVER (${ventanaOrden}) AS __reportes_export_row_number
  FROM source
)
SELECT
  numbered.*,
  DIV(__reportes_export_row_number - 1, max_rows) AS __reportes_export_part
FROM numbered;

SET total_rows = (
  SELECT COUNT(*)
  FROM _SESSION.export_rows
);

SET num_parts = DIV(total_rows + max_rows - 1, max_rows);

WHILE current_part < num_parts DO
  EXECUTE IMMEDIATE FORMAT("""
    EXPORT DATA OPTIONS(
      uri = '${uri}/parte-%s-*.csv.gz',
      format = 'CSV',
      compression = 'GZIP',
      overwrite = true,
      header = true,
      field_delimiter = '|'
    ) AS
    SELECT * EXCEPT (__reportes_export_row_number, __reportes_export_part)
    FROM _SESSION.export_rows
    WHERE __reportes_export_part = %d
    ORDER BY __reportes_export_row_number
  """,
    LPAD(CAST(current_part + 1 AS STRING), 3, '0'),
    current_part
  );
  SET current_part = current_part + 1;
END WHILE;

DROP TABLE export_rows;

SELECT
  total_rows AS total_rows,
  num_parts AS num_parts,
  max_rows AS max_rows;`;
}

function normalizarSqlFuente(sql: string): string {
  const limpio = sql.trim().replace(/;\s*$/, "").trim();
  if (!limpio) throw new Error("El SQL fuente es obligatorio");
  if (limpio.includes(";")) {
    throw new Error("El SQL fuente debe ser una sola consulta SELECT");
  }
  if (!/^(WITH\b|SELECT\b)/i.test(limpio)) {
    throw new Error("El SQL fuente debe iniciar con SELECT o WITH");
  }
  return limpio;
}

function normalizarUriGcs(uriBase: string): string {
  const limpio = uriBase.trim().replace(/\/+$/, "");
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]{1,221}[a-z0-9](?:\/[^'\n\r]*)?$/i.test(limpio)) {
    throw new Error("El destino de exportación debe ser una URI GCS válida (gs://...)");
  }
  return limpio;
}

function validarMaximoFilas(valor: number): void {
  if (!Number.isInteger(valor) || valor < 1 || valor > MAXIMO_FILAS_EXCEL) {
    throw new Error("El máximo de filas por bloque debe estar entre 1 y 1.000.000");
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
  return texto.split("\n").map((linea) => `${prefijo}${linea}`).join("\n").trimStart();
}

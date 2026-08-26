export interface EntradaConsultasTalendBigQuery {
  sql: string;
  uriBase: string;
  projectId: string;
  dataset: string;
  ejecucionId: string;
}

export interface ConsultasTalendBigQuery {
  sql: string;
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
}: EntradaConsultasTalendBigQuery): ConsultasTalendBigQuery {
  const sqlFuente = normalizarSqlFuente(sql);
  const uri = normalizarUriGcs(uriBase);
  validarIdentificadorGoogle(projectId, "proyecto");
  validarIdentificadorGoogle(dataset, "dataset");
  validarEjecucionId(ejecucionId);
  const sqlExportacion = `EXPORT DATA OPTIONS (\n  uri = '${uri}/parte-*.csv.gz',\n  format = 'CSV',\n  compression = 'GZIP',\n  overwrite = TRUE,\n  header = TRUE,\n  field_delimiter = '|'\n)\nAS\n${sqlFuente};`;
  return {
    sql: sqlExportacion,
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

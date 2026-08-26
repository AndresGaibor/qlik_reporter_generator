export interface EmisionBigQueryVNext {
  sql: string;
  strategy: "source_sql_passthrough" | "single_query";
}

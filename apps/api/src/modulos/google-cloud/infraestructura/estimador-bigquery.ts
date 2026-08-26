import { BigQuery } from "@google-cloud/bigquery";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type {
  MetadataCampoBigQuery,
  MetadataTablaBigQuery,
  ModoCampoBigQuery,
} from "../dominio/metadata-bigquery.js";

export interface OpcionesEstimadorBigQuery {
  projectId: string;
  dataset: string;
  credencialesJson?: string;
  precioUsdPorTib?: number;
}

export class EstimadorBigQuery {
  private readonly cliente: BigQuery;
  private readonly dataset: string;
  private readonly precioUsdPorTib: number;

  constructor(opciones: OpcionesEstimadorBigQuery) {
    if (!opciones.projectId.trim())
      throw new Error("El proyecto de BigQuery es obligatorio");
    if (!opciones.dataset.trim())
      throw new Error("El dataset de BigQuery es obligatorio");
    const credenciales = opciones.credencialesJson
      ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
      : undefined;
    this.cliente = new BigQuery({
      projectId: opciones.projectId.trim(),
      ...(credenciales ? { credentials: credenciales } : {}),
    });
    this.dataset = opciones.dataset.trim();
    this.precioUsdPorTib = opciones.precioUsdPorTib ?? 6.25;
  }

  async estimarConsulta(
    query: string,
  ): Promise<{ bytesProcesados: number; costoEstimadoUsd: number }> {
    try {
      const [job, apiResponse] = await this.cliente.createQueryJob({
        query,
        dryRun: true,
        useLegacySql: false,
      });
      const stats =
        job?.metadata?.statistics ??
        (
          apiResponse as {
            statistics?: { query?: { totalBytesProcessed?: string | number } };
          }
        )?.statistics;
      return this.resultado(Number(stats?.query?.totalBytesProcessed ?? 0));
    } catch (error) {
      const detalle =
        error instanceof Error
          ? error.message
          : "Error desconocido de BigQuery";
      throw new ErrorAplicacion(
        "BIGQUERY_VALIDACION_FALLIDA",
        `BigQuery rechazó la consulta con las credenciales configuradas: ${detalle}`.slice(
          0,
          1000,
        ),
        422,
      );
    }
  }

  async obtenerMetadataTabla(tabla: string): Promise<MetadataTablaBigQuery> {
    const { projectId, datasetId, tableId, qualifiedTableId } =
      this.resolverTabla(tabla);
    const [metadata] = await this.cliente
      .dataset(datasetId, projectId ? { projectId } : undefined)
      .table(tableId)
      .getMetadata();

    return {
      tableId: qualifiedTableId,
      fields: this.normalizarCamposMetadata(metadata.schema?.fields ?? []),
      ...(metadata.numBytes !== undefined
        ? { numBytes: Number(metadata.numBytes) }
        : {}),
      ...(metadata.timePartitioning
        ? {
            timePartitioning: {
              ...(metadata.timePartitioning.type
                ? { type: String(metadata.timePartitioning.type).toUpperCase() }
                : {}),
              ...(metadata.timePartitioning.field
                ? { field: String(metadata.timePartitioning.field) }
                : {}),
              ...(metadata.timePartitioning.expirationMs !== undefined
                ? {
                    expirationMs: Number(
                      metadata.timePartitioning.expirationMs,
                    ),
                  }
                : {}),
              ...(metadata.timePartitioning.requirePartitionFilter !== undefined
                ? {
                    requirePartitionFilter: Boolean(
                      metadata.timePartitioning.requirePartitionFilter,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(metadata.rangePartitioning?.field
        ? {
            rangePartitioning: {
              field: String(metadata.rangePartitioning.field),
              ...(metadata.rangePartitioning.range
                ? {
                    range: {
                      ...(metadata.rangePartitioning.range.start !== undefined
                        ? {
                            start: Number(
                              metadata.rangePartitioning.range.start,
                            ),
                          }
                        : {}),
                      ...(metadata.rangePartitioning.range.end !== undefined
                        ? { end: Number(metadata.rangePartitioning.range.end) }
                        : {}),
                      ...(metadata.rangePartitioning.range.interval !==
                      undefined
                        ? {
                            interval: Number(
                              metadata.rangePartitioning.range.interval,
                            ),
                          }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(metadata.clustering?.fields?.length
        ? { clusteringFields: metadata.clustering.fields.map(String) }
        : {}),
    };
  }

  async obtenerEsquemaTabla(tabla: string): Promise<Record<string, string>> {
    const metadata = await this.obtenerMetadataTabla(tabla);
    return Object.fromEntries(
      Object.entries(metadata.fields).map(([name, field]) => [
        name,
        field.type,
      ]),
    );
  }

  private resolverTabla(tabla: string): {
    projectId?: string;
    datasetId: string;
    tableId: string;
    qualifiedTableId: string;
  } {
    const partes = tabla
      .split(".")
      .map((parte) => parte.trim().replace(/^`|`$/g, ""));
    const [projectId, datasetId, tableId] =
      partes.length === 3
        ? partes
        : partes.length === 2
          ? [undefined, partes[0], partes[1]]
          : [undefined, this.dataset, partes[0]];
    if (!datasetId || !tableId)
      throw new Error(`Identificador BigQuery inválido: ${tabla}`);
    return {
      ...(projectId ? { projectId } : {}),
      datasetId,
      tableId,
      qualifiedTableId: projectId
        ? `${projectId}.${datasetId}.${tableId}`
        : `${datasetId}.${tableId}`,
    };
  }

  private normalizarCamposMetadata(
    fields: unknown,
  ): Record<string, MetadataCampoBigQuery> {
    if (!Array.isArray(fields)) return {};
    const resultado: Record<string, MetadataCampoBigQuery> = {};
    for (const raw of fields) {
      if (!raw || typeof raw !== "object") continue;
      const field = raw as Record<string, unknown>;
      if (!field.name || !field.type) continue;
      const nested = this.normalizarCamposMetadata(field.fields);
      resultado[String(field.name)] = {
        type: String(field.type).toUpperCase(),
        mode: this.normalizarModoCampo(field.mode),
        ...(field.precision !== undefined
          ? { precision: Number(field.precision) }
          : {}),
        ...(field.scale !== undefined ? { scale: Number(field.scale) } : {}),
        ...(field.maxLength !== undefined
          ? { maxLength: Number(field.maxLength) }
          : {}),
        ...(Object.keys(nested).length > 0 ? { fields: nested } : {}),
      };
    }
    return resultado;
  }

  private normalizarModoCampo(mode: unknown): ModoCampoBigQuery {
    const normalized = String(mode ?? "NULLABLE").toUpperCase();
    return normalized === "REQUIRED" || normalized === "REPEATED"
      ? normalized
      : "NULLABLE";
  }

  private resultado(bytesProcesados: number) {
    return {
      bytesProcesados,
      costoEstimadoUsd:
        (bytesProcesados / 1_099_511_627_776) * this.precioUsdPorTib,
    };
  }

  private async estimarDesdeMetadatos(query: string) {
    try {
      const matchTabla = query.match(/FROM\s+`?([^`\s]+)`?/i);
      let nombreTabla = matchTabla?.[1];
      if (nombreTabla?.includes("."))
        nombreTabla = nombreTabla.split(".").at(-1);
      if (!nombreTabla) return this.resultado(0);

      const [metadata] = await this.cliente
        .dataset(this.dataset)
        .table(nombreTabla)
        .getMetadata();
      const totalBytes = Number(metadata.numBytes ?? 0);
      const totalCampos = metadata.schema?.fields?.length ?? 1;
      const matchSelect = query.match(/SELECT\s+(.+?)\s+FROM/i);
      const seleccionados =
        matchSelect?.[1] && !matchSelect[1].includes("*")
          ? matchSelect[1]
              .split(",")
              .map((campo) => campo.trim())
              .filter(Boolean).length
          : totalCampos;
      const fraccionColumnas = Math.min(
        Math.max(seleccionados / totalCampos, 0.01),
        1,
      );
      return this.resultado(Math.round(totalBytes * fraccionColumnas));
    } catch {
      return this.resultado(0);
    }
  }
}

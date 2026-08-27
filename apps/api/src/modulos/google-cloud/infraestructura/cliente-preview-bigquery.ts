import { BigQuery } from "@google-cloud/bigquery";
import type { PuertoLecturaBigQuery, FilaBigQuery, OpcionesLecturaPreview } from "../aplicacion/puerto-lectura-bigquery.js";

export interface OpcionesClientePreviewBigQuery {
  projectId: string;
  dataset: string;
  credencialesJson?: string;
}

export class ClientePreviewBigQuery implements PuertoLecturaBigQuery {
  private readonly cliente: BigQuery;
  private readonly dataset: string;

  constructor(
    opciones: OpcionesClientePreviewBigQuery,
    clienteBigQuery?: BigQuery,
  ) {
    if (clienteBigQuery) {
      this.cliente = clienteBigQuery;
    } else {
      const credenciales = opciones.credencialesJson
        ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
        : undefined;
      this.cliente = new BigQuery({
        projectId: opciones.projectId.trim(),
        ...(credenciales ? { credentials: credenciales } : {}),
      });
    }
    this.dataset = opciones.dataset.trim();
  }

  async obtenerFilasPreview(
    tabla: string,
    opciones?: OpcionesLecturaPreview,
  ): Promise<FilaBigQuery> {
    const { datasetId, tableId } = this.resolverTabla(tabla);
    const table = this.cliente.dataset(datasetId).table(tableId);
    const maxFilas = opciones?.maxFilas ?? 100;

    const [apiResponse] = await table.getRows({ maxResults: maxFilas });

    if (!apiResponse || apiResponse.length === 0) {
      return { columnas: [], filas: [] };
    }

    const rawRows = apiResponse as Array<Record<string, unknown>>;
    const primeraFila = rawRows[0] as { f?: Array<{ v: unknown }> };
    const columnas = primeraFila.f?.map((_, i) => `col_${i}`) ?? [];

    const filas = rawRows.map((row) => {
      const fields = (row as { f?: Array<{ v: unknown }> }).f ?? [];
      return fields.map((field) => String(field.v ?? ""));
    });

    return { columnas, filas };
  }

  private resolverTabla(tabla: string): { datasetId: string; tableId: string } {
    const partes = tabla.split(".").map((p) => p.trim().replace(/^`|`$/g, ""));
    if (partes.length === 3) {
      return { datasetId: partes[1], tableId: partes[2] };
    }
    if (partes.length === 2) {
      return { datasetId: partes[0], tableId: partes[1] };
    }
    return { datasetId: this.dataset, tableId: partes[0] };
  }
}

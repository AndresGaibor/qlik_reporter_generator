import { BigQuery, Table } from "@google-cloud/bigquery";
import type { PuertoLecturaBigQuery, FilaBigQuery, OpcionesLecturaPreview } from "../aplicacion/puerto-lectura-bigquery.js";

export interface OpcionesClientePreviewBigQuery {
  projectId: string;
  dataset: string;
  credencialesJson?: string;
}

export class ClientePreviewBigQuery implements PuertoLecturaBigQuery {
  private readonly cliente: BigQuery;
  private readonly dataset: string;

  constructor(opciones: OpcionesClientePreviewBigQuery) {
    const credenciales = opciones.credencialesJson
      ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
      : undefined;
    this.cliente = new BigQuery({
      projectId: opciones.projectId.trim(),
      ...(credenciales ? { credentials: credenciales } : {}),
    });
    this.dataset = opciones.dataset.trim();
  }

  static createConCliente(
    opciones: OpcionesClientePreviewBigQuery,
    clienteBigQuery: BigQuery,
  ): ClientePreviewBigQuery {
    const instance = new ClientePreviewBigQuery(opciones);
    (instance as unknown as { cliente: BigQuery }).cliente = clienteBigQuery;
    return instance;
  }

  async obtenerFilasPreview(
    tabla: string,
    opciones?: OpcionesLecturaPreview,
  ): Promise<FilaBigQuery> {
    const { datasetId, tableId } = this.resolverTabla(tabla);
    const table = this.cliente.dataset(datasetId).table(tableId);
    const maxFilas = opciones?.maxFilas ?? 100;

    const [metadata] = await table.getMetadata();
    const esquema = (metadata.schema?.fields ?? []) as Array<{ name: string }>;
    let nombresColumnas = esquema.map((f) => f.name);

    const [apiResponse] = await table.getRows({ maxResults: maxFilas });

    if (!apiResponse || apiResponse.length === 0) {
      return { columnas: opciones?.columnas ?? nombresColumnas, filas: [] };
    }

    const rawRows = apiResponse as Array<Record<string, unknown>>;
    const filas = rawRows.map((row) => {
      if (Array.isArray(row.f)) {
        return row.f.map((field) =>
          String((field as { v?: unknown }).v ?? ""),
        );
      }
      return nombresColumnas.map((columna) => convertirValorFila(row[columna]));
    });

    if (opciones?.columnas && opciones.columnas.length > 0) {
      const indices = opciones.columnas.map((col) => {
        const idx = nombresColumnas.indexOf(col);
        return idx;
      });
      nombresColumnas = opciones.columnas;
      const filasFiltradas = filas.map((fila) =>
        indices.map((idx) => (idx >= 0 ? fila[idx] ?? "" : "")),
      );
      return { columnas: nombresColumnas, filas: filasFiltradas };
    }

    return { columnas: nombresColumnas, filas };
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

function convertirValorFila(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

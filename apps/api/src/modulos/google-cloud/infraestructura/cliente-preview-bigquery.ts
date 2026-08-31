import { BigQuery } from "@google-cloud/bigquery";
import type {
  FilasPreviewBigQuery,
  MetadataPreviewBigQuery,
  OpcionesFilasPreview,
  OpcionesMetadataPreview,
  PuertoLecturaBigQuery,
} from "../aplicacion/puerto-lectura-bigquery.js";

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

  async obtenerMetadataTabla(
    tabla: string,
    opciones?: OpcionesMetadataPreview,
  ): Promise<MetadataPreviewBigQuery> {
    const { projectId, datasetId, tableId } = this.resolverTabla(tabla);
    const table = this.cliente
      .dataset(datasetId, projectId ? { projectId } : undefined)
      .table(tableId);

    const [metadata] = await table.getMetadata();
    const fields = (metadata.schema?.fields ?? []) as Array<{
      name?: string;
      type?: string;
      mode?: string;
    }>;
    const columnas = fields
      .filter((field): field is typeof field & { name: string } =>
        Boolean(field.name),
      )
      .map((field) => ({
        nombre: field.name,
        ...(field.type ? { tipo: field.type } : {}),
        ...(field.mode ? { modo: field.mode } : {}),
      }));

    if (!opciones?.columnas?.length) return { columnas };

    const porNombre = new Map(
      columnas.map((columna) => [columna.nombre, columna]),
    );
    return {
      columnas: opciones.columnas
        .map((nombre) => porNombre.get(nombre))
        .filter((columna): columna is NonNullable<typeof columna> =>
          Boolean(columna),
        ),
    };
  }

  async obtenerFilasPreview(
    tabla: string,
    opciones: OpcionesFilasPreview,
  ): Promise<FilasPreviewBigQuery> {
    const { projectId, datasetId, tableId } = this.resolverTabla(tabla);
    const table = this.cliente
      .dataset(datasetId, projectId ? { projectId } : undefined)
      .table(tableId);
    const columnasSolicitadas = (opciones.columnas ?? []).filter(Boolean);
    const maxResults = Math.max(0, Math.min(5, opciones.maxFilas));
    const [rows] = await table.getRows({
      autoPaginate: false,
      maxResults,
      ...(columnasSolicitadas.length > 0
        ? { selectedFields: columnasSolicitadas.join(",") }
        : {}),
    });
    const filasObjetos = (rows ?? []) as Array<Record<string, unknown>>;
    const columnas =
      columnasSolicitadas.length > 0
        ? columnasSolicitadas
        : Object.keys(filasObjetos[0] ?? {});

    return {
      columnas,
      filas: filasObjetos
        .slice(0, maxResults)
        .map((fila) =>
          columnas.map((columna) => this.serializarValorPreview(fila[columna])),
        ),
    };
  }

  private serializarValorPreview(valor: unknown): string {
    if (valor === null || valor === undefined) return "";
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === "string") return valor;
    if (typeof valor === "number" || typeof valor === "bigint") {
      return String(valor);
    }
    if (typeof valor === "boolean") return valor ? "true" : "false";
    if (Array.isArray(valor)) {
      return JSON.stringify(
        valor.map((item) => this.serializarValorPreview(item)),
      );
    }
    if (typeof valor === "object") {
      const conValue = valor as { value?: unknown };
      if ("value" in conValue)
        return this.serializarValorPreview(conValue.value);
      try {
        return JSON.stringify(valor);
      } catch {
        return String(valor);
      }
    }
    return String(valor);
  }

  private resolverTabla(tabla: string): {
    projectId?: string;
    datasetId: string;
    tableId: string;
  } {
    const partes = tabla
      .split(".")
      .map((parte) => parte.trim().replace(/^`|`$/g, ""));
    if (partes.length === 3) {
      return { projectId: partes[0], datasetId: partes[1], tableId: partes[2] };
    }
    if (partes.length === 2) {
      return { datasetId: partes[0], tableId: partes[1] };
    }
    return { datasetId: this.dataset, tableId: partes[0] };
  }
}

import { BigQuery } from "@google-cloud/bigquery";
import type { PuertoDestino } from "../aplicacion/puertos/puerto-destino.js";
import type {
  CapacidadesDestino,
  DetalleRecursoDestino,
  RecursoDestino,
} from "../dominio/tipos-destino.js";

export interface OpcionesBigQuery {
  projectId: string;
  dataset: string;
  credencialesJson?: string;
  limiteMiB?: number;
  limiteUsd?: number;
  precioUsdPorTib?: number;
}

export class ClienteBigQuery implements PuertoDestino {
  readonly tipo = "bigquery" as const;
  private readonly cliente: BigQuery;
  private readonly dataset: string;
  private readonly limiteMiB?: number;
  private readonly limiteUsd?: number;
  private readonly precioUsdPorTib: number;

  constructor(opciones: OpcionesBigQuery) {
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
    this.limiteMiB = opciones.limiteMiB;
    this.limiteUsd = opciones.limiteUsd;
    this.precioUsdPorTib = opciones.precioUsdPorTib ?? 6.25;
  }

  obtenerCapacidades(): CapacidadesDestino {
    return {
      listarRecursos: true,
      esquema: true,
      conteoRegistros: true,
      vistaPrevia: true,
      escritura: false,
    };
  }

  async listarRecursos(): Promise<RecursoDestino[]> {
    const [tablas] = await this.cliente.dataset(this.dataset).getTables();
    return tablas.map((tabla) => ({
      id: tabla.id ?? "",
      nombre: tabla.id ?? "",
      tipo: "tabla",
      espacioDeNombres: this.dataset,
      metadatos: { tipoBigQuery: tabla.metadata?.type ?? "TABLE" },
    }));
  }

  async obtenerRecurso(id: string): Promise<DetalleRecursoDestino> {
    const [metadata] = await this.cliente
      .dataset(this.dataset)
      .table(id)
      .getMetadata();
    const columnas = (metadata.schema?.fields ?? []).map(
      (campo: { name?: string; type?: string }) => ({
        nombre: campo.name ?? "",
        tipo: campo.type ?? "",
      }),
    );
    return {
      id,
      nombre: id,
      tipo: "tabla",
      espacioDeNombres: this.dataset,
      columnas,
      totalFilas:
        metadata.numRows === undefined ? undefined : Number(metadata.numRows),
      actualizadoEn: new Date().toISOString(),
      metadatos: {
        ddl: typeof metadata.ddl === "string" ? metadata.ddl : null,
        numBytes:
          metadata.numBytes === undefined
            ? undefined
            : Number(metadata.numBytes),
        tipoBigQuery: metadata.type ?? "TABLE",
      },
    };
  }

  async probarConexion(): Promise<void> {
    await this.cliente.dataset(this.dataset).getMetadata();
  }

  async obtenerVistaPrevia(
    id: string,
    limite: number,
  ): Promise<Array<Record<string, unknown>>> {
    const [filas] = await this.cliente
      .dataset(this.dataset)
      .table(id)
      .getRows({
        maxResults: Math.min(Math.max(limite, 1), 1000),
      });
    return filas as Array<Record<string, unknown>>;
  }

  async obtenerDdl(id: string): Promise<string | null> {
    try {
      const [filas] = await this.cliente.query({
        query: `SELECT ddl FROM \`${this.cliente.projectId}.${this.dataset}.INFORMATION_SCHEMA.TABLES\` WHERE table_name = @nombreTabla`,
        params: { nombreTabla: id },
        useLegacySql: false,
      });
      if (
        filas &&
        filas.length > 0 &&
        typeof (filas[0] as Record<string, unknown>).ddl === "string"
      ) {
        return (filas[0] as Record<string, unknown>).ddl as string;
      }
    } catch {
      // Fallback si la vista de INFORMATION_SCHEMA no devuelve DDL
    }
    const [metadata] = await this.cliente
      .dataset(this.dataset)
      .table(id)
      .getMetadata();
    return typeof metadata.ddl === "string" ? metadata.ddl : null;
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
      const bytesProcesados = Number(stats?.query?.totalBytesProcessed ?? 0);
      const costoEstimadoUsd =
        (bytesProcesados / 1_099_511_627_776) * this.precioUsdPorTib;
      return { bytesProcesados, costoEstimadoUsd };
    } catch {
      // Fallback cuando la cuenta de servicio carece de permiso `bigquery.jobs.create`:
      // Estimación basada en metadatos de almacenamiento de la tabla (numBytes y proporción de campos)
      try {
        const matchTabla = query.match(/FROM\s+`?([^`\s]+)`?/i);
        let nombreTabla = matchTabla ? matchTabla[1] : undefined;
        if (nombreTabla?.includes(".")) {
          const partes = nombreTabla.split(".");
          nombreTabla = partes[partes.length - 1];
        }
        if (nombreTabla) {
          const [metadata] = await this.cliente
            .dataset(this.dataset)
            .table(nombreTabla)
            .getMetadata();
          const totalBytes = Number(metadata.numBytes ?? 0);
          const totalCampos = metadata.schema?.fields?.length ?? 1;

          const matchSelect = query.match(/SELECT\s+(.+?)\s+FROM/i);
          let seleccionados = totalCampos;
          if (matchSelect?.[1] && !matchSelect[1].includes("*")) {
            seleccionados = matchSelect[1]
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean).length;
          }

          const fraccionColumnas = Math.min(
            Math.max(seleccionados / totalCampos, 0.01),
            1,
          );

          let fraccionFechas = 1;
          const matchFechas = query.match(/DATE\("(\d{4}-\d{2}-\d{2})"\)/g);
          if (matchFechas && matchFechas.length >= 2) {
            const f1 = matchFechas[0].replace(/DATE\("|"\)/g, "");
            const f2 = matchFechas[1].replace(/DATE\("|"\)/g, "");
            const t1 = new Date(f1).getTime();
            const t2 = new Date(f2).getTime();
            if (!Number.isNaN(t1) && !Number.isNaN(t2) && t2 >= t1) {
              const diasFiltro = Math.max(
                Math.ceil((t2 - t1) / (1000 * 3600 * 24)) + 1,
                1,
              );
              fraccionFechas = Math.min(Math.max(diasFiltro / 365, 0.05), 1);
            }
          }

          const bytesProcesados = Math.round(
            totalBytes * fraccionColumnas * fraccionFechas,
          );
          const costoEstimadoUsd =
            (bytesProcesados / 1_099_511_627_776) * this.precioUsdPorTib;
          return { bytesProcesados, costoEstimadoUsd };
        }
      } catch {
        // Fallback silencioso
      }
      return { bytesProcesados: 0, costoEstimadoUsd: 0 };
    }
  }

  async ejecutarConsulta(
    query: string,
  ): Promise<Array<Record<string, unknown>>> {
    const estimacion = await this.estimarConsulta(query);
    const limiteBytes =
      this.limiteMiB === undefined ? undefined : this.limiteMiB * 1024 * 1024;
    const excedeBytes =
      limiteBytes !== undefined && estimacion.bytesProcesados > limiteBytes;
    const excedeUsd =
      this.limiteUsd !== undefined &&
      estimacion.costoEstimadoUsd > this.limiteUsd;
    if (excedeBytes || excedeUsd)
      throw new Error("La consulta supera el límite de coste configurado");
    const [filas] = await this.cliente.query({
      query,
      useLegacySql: false,
      ...(limiteBytes === undefined
        ? {}
        : { maximumBytesBilled: String(Math.floor(limiteBytes)) }),
    });
    return filas as Array<Record<string, unknown>>;
  }
}

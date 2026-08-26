import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { conexionesDestino } from "../../../plataforma/persistencia/esquema.js";

type DbType = ConexionDb;

export interface ServicioCifradoBigQuery {
  cifrar(valor: string): { cifrado: string; iv: string; tag: string };
  descifrar(cifrado: string, iv: string, tag: string): string;
}

export interface EntradaGuardarBigQueryAdmin {
  organizacionId: string;
  tenantQlikId: string;
  dataset: string;
  gcsUri?: string;
  credencialesJson?: string;
  projectId?: string;
  clientEmail?: string;
  limiteMiB?: number;
  limiteUsd?: number;
  maximoFilasPorArchivo: number;
  precioUsdPorTib: number;
}

export class ServicioBigQueryAdminPostgres {
  constructor(
    private readonly db: DbType,
    private readonly cifrado: ServicioCifradoBigQuery,
  ) {}

  async obtenerBigQuery(organizacionId: string, tenantQlikId: string) {
    const fila = await this.db.query.conexionesDestino.findFirst({
      where: (tabla, { and, eq }) =>
        and(
          eq(tabla.organizacionId, organizacionId),
          eq(tabla.tenantQlikId, tenantQlikId),
          eq(tabla.tipo, "bigquery"),
          eq(tabla.esPredeterminada, true),
        ),
    });

    if (!fila) {
      return {
        configurada: false,
        credencialesConfiguradas: false,
        maximoFilasPorArchivo: 1_000_000,
      };
    }

    const config = fila.config as Record<string, unknown>;
    const secretos = fila.secretoRefs as Record<string, unknown>;

    return {
      configurada: true,
      id: fila.id,
      estado: fila.estado as "activo" | "error" | "desconectado",
      projectId:
        typeof config.projectId === "string" ? config.projectId : undefined,
      dataset: typeof config.dataset === "string" ? config.dataset : undefined,
      gcsUri:
        typeof config.gcsUri === "string"
          ? config.gcsUri
          : "gs://bkt_dwh/POCs/TalendDescargados/",
      clientEmail:
        typeof config.clientEmail === "string" ? config.clientEmail : undefined,
      credencialesConfiguradas: Boolean(secretos.credencialesJson),
      maximoFilasPorArchivo:
        typeof config.maximoFilasPorArchivo === "number"
          ? config.maximoFilasPorArchivo
          : 1_000_000,
      mensajeError: fila.mensajeError,
    };
  }

  async probarBigQuery(organizacionId: string, tenantQlikId: string) {
    const fila = await this.db.query.conexionesDestino.findFirst({
      where: (tabla, { and, eq }) =>
        and(
          eq(tabla.organizacionId, organizacionId),
          eq(tabla.tenantQlikId, tenantQlikId),
          eq(tabla.tipo, "bigquery"),
          eq(tabla.esPredeterminada, true),
        ),
    });
    if (!fila) {
      throw new ErrorAplicacion(
        "BIGQUERY_NO_CONFIGURADO",
        "BigQuery no está configurado para este entorno",
        422,
      );
    }

    const config = fila.config as Record<string, unknown>;
    const projectId =
      typeof config.projectId === "string" ? config.projectId.trim() : "";
    const dataset =
      typeof config.dataset === "string" ? config.dataset.trim() : "";
    const secreto = (fila.secretoRefs as Record<string, unknown>)
      .credencialesJson;
    if (!projectId || !dataset || !secreto || typeof secreto !== "object") {
      throw new ErrorAplicacion(
        "BIGQUERY_INCOMPLETO",
        "La configuración de BigQuery está incompleta",
        422,
      );
    }

    const cifrado = secreto as { cifrado: string; iv: string; tag: string };
    const credenciales = JSON.parse(
      this.cifrado.descifrar(cifrado.cifrado, cifrado.iv, cifrado.tag),
    ) as Record<string, unknown>;

    try {
      const cliente = new BigQuery({ projectId, credentials: credenciales });
      await cliente.dataset(dataset).getMetadata();
      await this.db
        .update(conexionesDestino)
        .set({
          estado: "activo",
          mensajeError: null,
          actualizadoEn: new Date(),
        })
        .where(eq(conexionesDestino.id, fila.id));
      return { exitoso: true, mensaje: "Conexión con BigQuery verificada" };
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudo conectar con BigQuery";
      await this.db
        .update(conexionesDestino)
        .set({
          estado: "error",
          mensajeError: mensaje,
          actualizadoEn: new Date(),
        })
        .where(eq(conexionesDestino.id, fila.id));
      return { exitoso: false, mensaje };
    }
  }

  async guardarBigQuery(entrada: EntradaGuardarBigQueryAdmin) {
    const existente = await this.db.query.conexionesDestino.findFirst({
      where: (tabla, { and, eq }) =>
        and(
          eq(tabla.organizacionId, entrada.organizacionId),
          eq(tabla.tenantQlikId, entrada.tenantQlikId),
          eq(tabla.tipo, "bigquery"),
          eq(tabla.esPredeterminada, true),
        ),
    });

    const secretosExistentes =
      (existente?.secretoRefs as Record<string, unknown> | undefined) ?? {};

    const secretoRefs = entrada.credencialesJson
      ? {
          ...secretosExistentes,
          credencialesJson: this.cifrado.cifrar(entrada.credencialesJson),
        }
      : secretosExistentes;

    if (!secretoRefs.credencialesJson) {
      throw new Error("La cuenta de servicio BigQuery es obligatoria");
    }

    const config = {
      projectId: entrada.projectId,
      clientEmail: entrada.clientEmail,
      dataset: entrada.dataset,
      gcsUri:
        entrada.gcsUri ??
        (typeof (existente?.config as Record<string, unknown> | undefined)
          ?.gcsUri === "string"
          ? String((existente?.config as Record<string, unknown>).gcsUri)
          : "gs://bkt_dwh/POCs/TalendDescargados/"),
      ...(entrada.limiteMiB === undefined
        ? {}
        : { limiteMiB: entrada.limiteMiB }),
      ...(entrada.limiteUsd === undefined
        ? {}
        : { limiteUsd: entrada.limiteUsd }),
      maximoFilasPorArchivo: entrada.maximoFilasPorArchivo,
      precioUsdPorTib: entrada.precioUsdPorTib,
    };

    const valores = {
      organizacionId: entrada.organizacionId,
      tenantQlikId: entrada.tenantQlikId,
      tipo: "bigquery",
      nombre: existente?.nombre ?? "BigQuery principal",
      config,
      secretoRefs,
      estado: "desconectado",
      mensajeError: null,
      esPredeterminada: true,
      actualizadoEn: new Date(),
    };

    const [fila] = existente
      ? await this.db
          .update(conexionesDestino)
          .set(valores)
          .where(eq(conexionesDestino.id, existente.id))
          .returning()
      : await this.db.insert(conexionesDestino).values(valores).returning();

    if (!fila) throw new Error("No se pudo guardar BigQuery");

    return {
      configurada: true,
      id: fila.id,
      estado: "desconectado" as const,
      projectId: entrada.projectId,
      dataset: entrada.dataset,
      gcsUri: config.gcsUri,
      clientEmail: entrada.clientEmail,
      credencialesConfiguradas: true,
      maximoFilasPorArchivo: entrada.maximoFilasPorArchivo,
      mensajeError: null,
    };
  }
}

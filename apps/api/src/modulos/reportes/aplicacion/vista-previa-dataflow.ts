import type { ColumnaPreviewBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { analizarProgramaQlik } from "./compilador-vnext/analizador-semantico/principal.js";
import type {
  PlanCompilacionVNext,
  RelacionVNext,
} from "./compilador-vnext/ir.js";
import { parsearProgramaQlik } from "./compilador-vnext/parser-programa/principal.js";
import { EvaluadorPreview } from "./evaluador-preview.js";
import { generarDatosPreview } from "./generador-datos-preview.js";

export interface RespuestaVistaPrevia {
  columnas: string[];
  filas: string[][];
  filasReferencia: number;
  fuentesReferencia: string[];
  contieneAgregaciones: boolean;
  advertencias: string[];
  esAproximacion: true;
  origenMuestra: "referencia" | "hibrida" | "sintetica";
}
const FILAS_POR_FUENTE = 5;
const MAX_FILAS_RESULTADO = 10;

export class VistaPreviaDataflow {
  private readonly qlik: PuertoQlik;
  private readonly bigquery: PuertoLecturaBigQuery;

  constructor(qlik: PuertoQlik, bigquery: PuertoLecturaBigQuery) {
    this.qlik = qlik;
    this.bigquery = bigquery;
  }

  async ejecutar(
    flujoId: string,
    appId: string,
  ): Promise<RespuestaVistaPrevia> {
    void flujoId;
    const { script } = await this.qlik.obtenerScriptApp(appId, "current");
    const programa = parsearProgramaQlik(script);
    const plan = analizarProgramaQlik(programa);

    const {
      filasReferencia,
      fuentesReferencia,
      datosDeFuentes,
      advertencias: advertenciasFuentes,
      contieneValoresSinteticos,
    } = await this.obtenerDatosDeFuentes(plan);

    const resultado = new EvaluadorPreview(plan).evaluarInline(datosDeFuentes);
    const filasEvaluadas = resultado.filas.slice(0, MAX_FILAS_RESULTADO);
    const fallbackFinal = generarDatosPreview({
      columnas: resultado.columnas.map((nombre) => ({ nombre })),
      cantidadFilas: Math.max(filasEvaluadas.length, FILAS_POR_FUENTE),
      semilla: "resultado-final",
      clavesJoin: this.obtenerClavesJoin(plan),
    }).filas;
    const filas = filasEvaluadas.map((fila, indiceFila) =>
      resultado.columnas.map((_, indiceColumna) =>
        fila[indiceColumna]?.trim()
          ? fila[indiceColumna]
          : (fallbackFinal[indiceFila]?.[indiceColumna] ?? ""),
      ),
    );
    return {
      columnas: resultado.columnas,
      filas,
      filasReferencia,
      fuentesReferencia,
      contieneAgregaciones: resultado.contieneAgregaciones,
      advertencias: [...advertenciasFuentes, ...resultado.advertencias],
      esAproximacion: true,
      origenMuestra:
        filasReferencia === 0
          ? "sintetica"
          : contieneValoresSinteticos
            ? "hibrida"
            : "referencia",
    };
  }

  private async obtenerDatosDeFuentes(plan: PlanCompilacionVNext): Promise<{
    filasReferencia: number;
    fuentesReferencia: string[];
    datosDeFuentes: Record<string, { columnas: string[]; filas: string[][] }>;
    advertencias: string[];
    contieneValoresSinteticos: boolean;
  }> {
    const datosDeFuentes: Record<
      string,
      { columnas: string[]; filas: string[][] }
    > = {};
    let filasReferencia = 0;
    const fuentesReferencia: string[] = [];
    const advertencias: string[] = [];
    let contieneValoresSinteticos = false;
    const clavesJoin = this.obtenerClavesJoin(plan);

    for (const relacion of plan.relations) {
      if (!this.esFuenteBase(relacion)) continue;

      if (relacion.op === "native_sql") {
        const tabla = this.extraerNombreTabla(relacion);
        let columnas: ColumnaPreviewBigQuery[] = [];
        let metadataDisponible = false;

        try {
          const metadata = await this.bigquery.obtenerMetadataTabla(tabla, {
            columnas: relacion.fields.length > 0 ? relacion.fields : undefined,
          });
          columnas = metadata.columnas;
          metadataDisponible = columnas.length > 0;
        } catch (error) {
          const detalle = error instanceof Error ? `: ${error.message}` : "";
          advertencias.push(
            `No se pudo obtener metadata de la fuente ${tabla}${detalle}. Se usó la estructura del reporte para simularla.`,
          );
        }

        if (columnas.length === 0) {
          columnas = this.inferirColumnasRelacion(relacion);
        }

        const fallback = generarDatosPreview({
          columnas,
          cantidadFilas: FILAS_POR_FUENTE,
          semilla: relacion.id,
          clavesJoin,
        });

        if (!metadataDisponible) {
          contieneValoresSinteticos = true;
          datosDeFuentes[relacion.id] = fallback;
          continue;
        }

        try {
          const head = await this.bigquery.obtenerFilasPreview(tabla, {
            maxFilas: FILAS_POR_FUENTE,
            columnas: columnas.map((columna) => columna.nombre),
          });
          if (head.filas.length > 0) {
            filasReferencia += Math.min(FILAS_POR_FUENTE, head.filas.length);
            fuentesReferencia.push(tabla);
          }
          const combinado = this.combinarHeadConFallback(
            head,
            fallback,
            clavesJoin,
          );
          if (this.seNecesitaFallback(head, fallback.columnas, clavesJoin)) {
            contieneValoresSinteticos = true;
          }
          datosDeFuentes[relacion.id] = combinado;
        } catch (error) {
          const detalle = error instanceof Error ? `: ${error.message}` : "";
          advertencias.push(
            `No se pudo obtener HEAD de la fuente ${tabla}${detalle}. Se usaron valores sintéticos de respaldo.`,
          );
          contieneValoresSinteticos = true;
          datosDeFuentes[relacion.id] = fallback;
        }
        continue;
      }

      contieneValoresSinteticos = true;
      datosDeFuentes[relacion.id] = generarDatosPreview({
        columnas: this.inferirColumnasRelacion(relacion),
        cantidadFilas: FILAS_POR_FUENTE,
        semilla: relacion.id,
        clavesJoin,
      });
    }

    return {
      filasReferencia,
      fuentesReferencia,
      datosDeFuentes,
      advertencias,
      contieneValoresSinteticos,
    };
  }

  private combinarHeadConFallback(
    head: { columnas: string[]; filas: string[][] },
    fallback: { columnas: string[]; filas: string[][] },
    clavesJoin: string[],
  ): { columnas: string[]; filas: string[][] } {
    if (head.filas.length === 0) return fallback;

    const indicesHead = new Map(
      head.columnas.map((columna, indice) => [
        this.normalizarNombreCampo(columna),
        indice,
      ]),
    );
    const clavesNormalizadas = new Set(
      clavesJoin.map((clave) => this.normalizarNombreCampo(clave)),
    );

    return {
      columnas: fallback.columnas,
      filas: fallback.filas.map((filaFallback, indiceFila) => {
        const filaHead = head.filas[indiceFila];
        if (!filaHead) return filaFallback;

        return fallback.columnas.map((columna, indiceColumna) => {
          const nombreNormalizado = this.normalizarNombreCampo(columna);
          if (clavesNormalizadas.has(nombreNormalizado)) {
            return filaFallback[indiceColumna] ?? "";
          }
          const indiceHead = indicesHead.get(nombreNormalizado);
          const valorHead =
            indiceHead === undefined ? undefined : filaHead[indiceHead];
          return valorHead?.trim()
            ? valorHead
            : (filaFallback[indiceColumna] ?? "");
        });
      }),
    };
  }

  private seNecesitaFallback(
    head: { columnas: string[]; filas: string[][] },
    columnasSalida: string[],
    clavesJoin: string[],
  ): boolean {
    if (clavesJoin.length > 0 || head.filas.length === 0) return true;
    const indices = new Map(
      head.columnas.map((columna, indice) => [
        this.normalizarNombreCampo(columna),
        indice,
      ]),
    );
    return columnasSalida.some((columna) => {
      const indice = indices.get(this.normalizarNombreCampo(columna));
      return indice === undefined || !head.filas[0]?.[indice]?.trim();
    });
  }

  private normalizarNombreCampo(nombre: string): string {
    return this.limpiarReferenciaCampo(nombre)
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private esFuenteBase(relacion: RelacionVNext): boolean {
    return (
      relacion.op === "native_sql" ||
      relacion.op === "autogenerate" ||
      relacion.op === "inline"
    );
  }

  private obtenerClavesJoin(plan: PlanCompilacionVNext): string[] {
    return Array.from(
      new Set(
        plan.relations.flatMap((relacion) =>
          relacion.op === "join" ? relacion.keys : [],
        ),
      ),
    );
  }

  private inferirColumnasRelacion(
    relacion: RelacionVNext,
  ): ColumnaPreviewBigQuery[] {
    if (relacion.op === "inline") {
      return relacion.columns.map((nombre) => ({ nombre }));
    }
    if (relacion.fields.length > 0) {
      return relacion.fields.map((nombre) => ({
        nombre: this.limpiarReferenciaCampo(nombre),
        ...(relacion.fieldMetadata?.[nombre]?.type
          ? { tipo: relacion.fieldMetadata[nombre].type }
          : {}),
        ...(relacion.fieldMetadata?.[nombre]?.mode
          ? { modo: relacion.fieldMetadata[nombre].mode }
          : {}),
      }));
    }
    if (relacion.op === "native_sql") {
      return this.inferirColumnasDesdeSql(relacion.sql).map((nombre) => ({
        nombre,
      }));
    }
    if (relacion.op === "autogenerate") {
      return relacion.projections.map((proyeccion) => ({
        nombre:
          proyeccion.alias ??
          this.limpiarReferenciaCampo(proyeccion.expression),
      }));
    }
    return [];
  }

  private inferirColumnasDesdeSql(sql: string): string[] {
    const select = sql.match(/\bSELECT\s+([\s\S]+?)\s+FROM\b/i)?.[1];
    if (!select) return [];
    return select
      .split(",")
      .map((fragmento) => {
        const alias = fragmento.match(
          /\bAS\s+([`\[\]A-Za-z0-9_ -]+)\s*$/i,
        )?.[1];
        const candidato =
          alias ?? fragmento.trim().split(".").at(-1) ?? fragmento;
        return this.limpiarReferenciaCampo(candidato.trim());
      })
      .filter(Boolean);
  }

  private limpiarReferenciaCampo(valor: string): string {
    return valor
      .trim()
      .replace(/^\[|\]$/g, "")
      .replace(/^`|`$/g, "");
  }

  private extraerNombreTabla(
    relacion: RelacionVNext & { op: "native_sql" },
  ): string {
    const identificador = "(?:`[^`]+`|\\[[^\\]]+\\]|[A-Za-z0-9_-]+)";
    const match = relacion.sql.match(
      new RegExp(
        `\\bFROM\\s+(${identificador}(?:\\s*\\.\\s*${identificador}){0,2})`,
        "i",
      ),
    );
    if (match?.[1]) {
      return match[1]
        .split(".")
        .map((parte) =>
          parte
            .trim()
            .replace(/^`|`$/g, "")
            .replace(/^\[|\]$/g, ""),
        )
        .join(".");
    }
    return relacion.logicalName || relacion.id;
  }
}

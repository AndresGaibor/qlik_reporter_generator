import type { PreflightDataflowReporte } from "@qlik/contratos";
import type {
  CrearDesdePlantilla,
  ResultadoCrearDesdePlantilla,
} from "@qlik/contratos/automatizaciones";
import type { PuertoAuditoria } from "../../../../nucleo/auditoria/puerto-auditoria.js";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import type { PuertoOutbox } from "../../../../nucleo/eventos/puerto-outbox.js";
import type { PuertoIdempotencia } from "../../../../nucleo/idempotencia/puerto-idempotencia.js";
import { generarUuid } from "../../../../nucleo/valores/generar-uuid.js";
import type { PuertoQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import { URI_BASE_GCS_REPORTES } from "../../../reportes/dominio/destino-gcs.js";
import { copiarAutomatizacion } from "../servicios/servicio-copia-automatizacion.js";
import {
  completarIdempotencia,
  fallarIdempotencia,
  verificarIdempotencia,
} from "../servicios/servicio-idempotencia.js";
import { hashCanonico } from "../servicios/utilidades-automatizacion.js";

export interface ContextoCreacionAutomatizacion {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  idSolicitud?: string;
  ip?: string;
  agenteUsuario?: string;
}

export interface ValidadorDataflowReporte {
  ejecutar(flujoIdQlik: string): Promise<PreflightDataflowReporte>;
}

export class CrearAutomatizacionDesdePlantilla {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly idempotencia: PuertoIdempotencia,
    private readonly outbox: PuertoOutbox,
    private readonly auditoria: PuertoAuditoria,
    private readonly repositorioReportes: PuertoRepositorioReportes,
    private readonly preflight: ValidadorDataflowReporte,
  ) {}

  async ejecutar(
    entrada: CrearDesdePlantilla,
    contexto: ContextoCreacionAutomatizacion,
  ): Promise<ResultadoCrearDesdePlantilla> {
    const alcance = "automatizaciones.crear-desde-plantilla";
    const hashSolicitud = await hashCanonico(entrada);
    const clave = entrada.claveIdempotencia;

    if (clave) {
      const { esNuevo, resultadoPrevio } = await verificarIdempotencia(
        this.idempotencia,
        {
          organizacionId: contexto.organizacionId,
          alcance,
          clave,
          hashSolicitud,
        },
      );
      if (!esNuevo && resultadoPrevio) return resultadoPrevio;
    }

    const flujoIdQlik = entrada.flujoId?.trim();
    if (!flujoIdQlik) {
      const error = new ErrorAplicacion(
        "DATAFLOW_REQUERIDO",
        "Debes seleccionar un Dataflow de Qlik para crear el reporte",
        422,
      );
      await this.registrarFalloIdempotencia(contexto, alcance, clave, error);
      throw error;
    }

    const validacion = await this.preflight.ejecutar(flujoIdQlik);
    if (!validacion.compatible) {
      const error = new ErrorAplicacion(
        "DATAFLOW_NO_COMPATIBLE",
        "El Dataflow contiene operaciones que todavía no pueden convertirse a BigQuery SQL",
        422,
        { operacionesNoSoportadas: validacion.operacionesNoSoportadas },
      );
      await this.registrarFalloIdempotencia(contexto, alcance, clave, error);
      throw error;
    }

    const flujos = await this.qlik.listarFlujos(entrada.espacioIdQlik);
    const flujo = flujos.find((item) => item.id === flujoIdQlik);
    if (!flujo) {
      const error = new ErrorAplicacion(
        "DATAFLOW_NO_ENCONTRADO",
        "El Dataflow seleccionado ya no está disponible en Qlik",
        404,
      );
      await this.registrarFalloIdempotencia(contexto, alcance, clave, error);
      throw error;
    }

    let copiaId: string | undefined;
    const resultadoCopia = await copiarAutomatizacion(this.qlik, entrada);
    copiaId = resultadoCopia.id;

    if (resultadoCopia.error) {
      await this.qlik.eliminarAutomatizacion(copiaId).catch(() => undefined);
      await this.registrarErrorCreacion(
        contexto,
        copiaId,
        resultadoCopia.error,
        alcance,
        clave,
      );
      throw resultadoCopia.error;
    }

    const resultado: ResultadoCrearDesdePlantilla = {
      id: resultadoCopia.id,
      nombre: resultadoCopia.nombre,
      plantillaIdQlik: resultadoCopia.plantillaIdQlik,
    };

    try {
      await this.repositorioReportes.crearConfiguracion({
        organizacionId: contexto.organizacionId,
        tenantQlikId: contexto.tenantId,
        creadoPorUsuarioId: contexto.usuarioId,
        nombre: resultado.nombre,
        flujoIdQlik,
        flujoNombreSnapshot: flujo.name,
        ...(flujo.spaceId ? { flujoEspacioIdQlik: flujo.spaceId } : {}),
        destinoProveedor: "gcs",
        destinoIdExterno: URI_BASE_GCS_REPORTES,
        destinoNombreSnapshot: "TalendDescargados",
        automatizacionIdQlik: resultado.id,
        automatizacionNombreSnapshot: resultado.nombre,
        estado: "activa",
        ...(clave ? { claveIdempotencia: clave } : {}),
      });

      await Promise.all([
        this.outbox.guardar([
          {
            id: generarUuid(),
            tipo: "automatizaciones.automatizacion-creada-desde-plantilla.v1",
            agregadoTipo: "automatizacion-qlik",
            agregadoId: resultado.id,
            version: 1,
            ocurridoEn: new Date(),
            datos: resultado,
            metadatos: {
              tenantId: contexto.tenantId,
              organizacionId: contexto.organizacionId,
              usuarioId: contexto.usuarioId,
              flujoIdQlik,
            },
          },
        ]),
        this.auditoria.registrar({
          organizacionId: contexto.organizacionId,
          usuarioId: contexto.usuarioId,
          accion: "automatizacion.crear-desde-plantilla",
          entidadTipo: "automatizacion-qlik",
          entidadId: resultado.id,
          resultado: "exito",
          datosNuevos: { ...resultado, flujoIdQlik },
          idSolicitud: contexto.idSolicitud,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
        }),
      ]);

      if (clave) {
        await completarIdempotencia(
          this.idempotencia,
          { organizacionId: contexto.organizacionId, alcance, clave },
          201,
          resultado,
        );
      }
      return resultado;
    } catch (error) {
      await this.qlik.eliminarAutomatizacion(copiaId).catch(() => undefined);
      await this.registrarErrorCreacion(
        contexto,
        copiaId,
        error,
        alcance,
        clave,
      );
      throw error;
    }
  }

  private async registrarErrorCreacion(
    contexto: ContextoCreacionAutomatizacion,
    copiaId: string | undefined,
    error: unknown,
    alcance: string,
    clave?: string,
  ) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido";
    await this.auditoria
      .registrar({
        organizacionId: contexto.organizacionId,
        usuarioId: contexto.usuarioId,
        accion: "automatizacion.crear-desde-plantilla",
        entidadTipo: "automatizacion-qlik",
        entidadId: copiaId,
        resultado: "error",
        mensajeError: mensaje,
        idSolicitud: contexto.idSolicitud,
        ip: contexto.ip,
        agenteUsuario: contexto.agenteUsuario,
      })
      .catch(() => undefined);
    await this.registrarFalloIdempotencia(contexto, alcance, clave, error);
  }

  private async registrarFalloIdempotencia(
    contexto: ContextoCreacionAutomatizacion,
    alcance: string,
    clave: string | undefined,
    error: unknown,
  ) {
    if (!clave) return;
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido";
    await fallarIdempotencia(
      this.idempotencia,
      { organizacionId: contexto.organizacionId, alcance, clave },
      estadoHttpDelError(error),
      { mensaje },
    ).catch(() => undefined);
  }
}

function estadoHttpDelError(error: unknown): number {
  if (error instanceof ErrorAplicacion) return error.estadoHttp;
  if (
    error instanceof Error &&
    "estadoHttp" in error &&
    typeof (error as { estadoHttp?: unknown }).estadoHttp === "number"
  ) {
    return (error as { estadoHttp: number }).estadoHttp;
  }
  return 500;
}

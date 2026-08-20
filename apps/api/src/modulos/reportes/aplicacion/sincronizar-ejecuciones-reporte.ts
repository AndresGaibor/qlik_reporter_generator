import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { EjecucionQlik } from "../../qlik/dominio/modelos-qlik.js";
import { esNoEncontradoQlik } from "../../qlik/infraestructura/error-api-qlik.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";

const TERMINALES = new Map<string, "error" | "detenida">([
  ["failed", "error"],
  ["exceeded limit", "error"],
  ["stopped", "detenida"],
]);

export class SincronizarEjecucionesReporte {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioReportes,
  ) {}

  async ejecutar(
    flujoIdQlik: string,
    tenantQlikId: string,
    organizacionId: string,
  ) {
    const locales = await this.repositorio.listarEjecuciones(
      flujoIdQlik,
      tenantQlikId,
      organizacionId,
      100,
    );
    const pendientes = locales.filter(
      (item) =>
        item.runIdQlik &&
        item.estado !== "completada" &&
        item.estado !== "error" &&
        item.estado !== "detenida",
    );
    if (pendientes.length === 0) return;

    const porAutomate = new Map<string, Map<string, EjecucionQlik>>();
    const automatesEliminados = new Set<string>();
    for (const automatizacionIdQlik of new Set(
      pendientes.map((item) => item.automatizacionIdQlik),
    )) {
      try {
        const remotas = await this.qlik.listarEjecuciones(
          automatizacionIdQlik,
          {
            limit: 100,
            sort: "desc",
          },
        );
        porAutomate.set(
          automatizacionIdQlik,
          new Map(remotas.map((item) => [item.id, item])),
        );
      } catch (error) {
        if (!esNoEncontradoQlik(error)) throw error;
        automatesEliminados.add(automatizacionIdQlik);
      }
    }

    for (const local of pendientes) {
      if (!local.runIdQlik) continue;
      if (automatesEliminados.has(local.automatizacionIdQlik)) {
        await this.repositorio.marcarEstadoEjecucion(
          local.id,
          "detenida",
          new Date(),
        );
        continue;
      }
      const remota = porAutomate
        .get(local.automatizacionIdQlik)
        ?.get(local.runIdQlik);
      if (!remota) continue;
      const estado = TERMINALES.get(remota.status.toLowerCase());
      if (!estado) continue;
      const fecha = fechaTerminal(remota.stopTime, remota.updatedAt);

      if (estado === "error") {
        const detalle = await this.obtenerDetalleError(
          local.automatizacionIdQlik,
          local.runIdQlik,
          remota,
        );
        await this.repositorio.marcarEjecucionError(
          local.id,
          detalle.etapa,
          detalle.mensaje,
          fecha,
        );
        continue;
      }

      await this.repositorio.marcarEstadoEjecucion(local.id, estado, fecha);
    }
  }

  private async obtenerDetalleError(
    automatizacionIdQlik: string,
    runIdQlik: string,
    resumen: EjecucionQlik,
  ): Promise<{ etapa: string; mensaje: string }> {
    let ejecucion = resumen;
    try {
      ejecucion = await this.qlik.solicitarJson<EjecucionQlik>({
        metodo: "GET",
        ruta: `/api/workflows/automations/${automatizacionIdQlik}/runs/${runIdQlik}`,
      });
    } catch {
      // El resumen sigue permitiendo registrar un error útil.
    }

    const mensaje = extraerMensajeError(ejecucion.error);
    const etapa = contieneTalend(ejecucion.error) ? "talend" : "ejecucion-qlik";

    return {
      etapa,
      mensaje:
        mensaje ??
        `La ejecución Qlik finalizó con estado ${ejecucion.status || resumen.status}`,
    };
  }
}

function extraerMensajeError(error: unknown): string | null {
  for (const item of normalizarErrores(error)) {
    const response = comoRegistro(item.response);
    const body = comoRegistro(response?.body);
    const mensajeRespuesta = textoNoVacio(body?.message);
    if (mensajeRespuesta) return mensajeRespuesta;

    const detalle = textoNoVacio(item.detail);
    if (detalle) return detalle;

    const mensaje = textoNoVacio(item.message);
    if (mensaje) return mensaje;

    const errorPlano = textoNoVacio(item.error);
    if (errorPlano) return errorPlano;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return null;
}

function contieneTalend(error: unknown): boolean {
  return normalizarErrores(error).some((item) => {
    const endpoint = comoRegistro(item.endpoint);
    const datasource = textoNoVacio(endpoint?.datasource);
    const nombre = textoNoVacio(endpoint?.name);
    return `${datasource ?? ""} ${nombre ?? ""}`
      .toLowerCase()
      .includes("talend");
  });
}

function normalizarErrores(error: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(error)) {
    return error.map(comoRegistro).filter(Boolean) as Array<
      Record<string, unknown>
    >;
  }
  const uno = comoRegistro(error);
  return uno ? [uno] : [];
}

function comoRegistro(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function fechaTerminal(stopTime?: string, updatedAt?: string): Date {
  for (const valor of [stopTime, updatedAt]) {
    if (!valor) continue;
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) return fecha;
  }
  return new Date();
}

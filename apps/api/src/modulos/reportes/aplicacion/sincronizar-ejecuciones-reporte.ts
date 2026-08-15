import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "./puertos/puerto-repositorio-reportes.js";

const TERMINALES = new Map<string, "completada" | "error" | "detenida">([
  ["finished", "completada"],
  ["finished with warnings", "completada"],
  ["failed", "error"],
  ["exceeded limit", "error"],
  ["stopped", "detenida"],
]);

export class SincronizarEjecucionesReporte {
  constructor(
    private readonly qlik: PuertoQlik,
    private readonly repositorio: PuertoRepositorioReportes,
  ) {}

  async ejecutar(tenantQlikId: string, automatizacionIdQlik: string) {
    const configuracion = await this.repositorio.obtenerPorAutomatizacion(
      tenantQlikId,
      automatizacionIdQlik,
    );
    if (!configuracion) return;

    const locales = await this.repositorio.listarEjecuciones(
      configuracion.id,
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

    const remotas = await this.qlik.listarEjecuciones(automatizacionIdQlik, {
      limit: 100,
      sort: "desc",
    });
    const porId = new Map(remotas.map((item) => [item.id, item]));

    for (const local of pendientes) {
      if (!local.runIdQlik) continue;
      const remota = porId.get(local.runIdQlik);
      if (!remota) continue;
      const estado = TERMINALES.get(remota.status.toLowerCase());
      if (!estado) continue;
      const fecha = fechaTerminal(remota.stopTime, remota.updatedAt);
      await this.repositorio.marcarEstadoPorRunQlik(
        local.runIdQlik,
        estado,
        fecha,
      );
    }
  }
}

function fechaTerminal(stopTime?: string, updatedAt?: string): Date {
  for (const valor of [stopTime, updatedAt]) {
    if (!valor) continue;
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) return fecha;
  }
  return new Date();
}

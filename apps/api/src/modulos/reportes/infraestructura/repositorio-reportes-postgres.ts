import { and, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { configuracionesAutomatizacion } from "../../../plataforma/persistencia/esquema.js";
import type {
  ConfiguracionReportePersistida,
  CrearConfiguracionReportePersistida,
  PuertoRepositorioReportes,
} from "../aplicacion/puertos/puerto-repositorio-reportes.js";

export class RepositorioReportesPostgres implements PuertoRepositorioReportes {
  constructor(private readonly db: ConexionDb) {}

  async crearConfiguracion(
    entrada: CrearConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida> {
    const [fila] = await this.db
      .insert(configuracionesAutomatizacion)
      .values(entrada)
      .returning();
    if (!fila)
      throw new Error("No se pudo persistir la configuración del reporte");
    return mapearConfiguracion(fila);
  }

  async obtenerPorAutomatizacion(
    tenantQlikId: string,
    automatizacionIdQlik: string,
  ): Promise<ConfiguracionReportePersistida | null> {
    const fila = await this.db.query.configuracionesAutomatizacion.findFirst({
      where: and(
        eq(configuracionesAutomatizacion.tenantQlikId, tenantQlikId),
        eq(
          configuracionesAutomatizacion.automatizacionIdQlik,
          automatizacionIdQlik,
        ),
      ),
    });
    return fila ? mapearConfiguracion(fila) : null;
  }
}

function mapearConfiguracion(
  fila: typeof configuracionesAutomatizacion.$inferSelect,
): ConfiguracionReportePersistida {
  if (!fila.automatizacionIdQlik || !fila.automatizacionNombreSnapshot) {
    throw new Error(
      "La configuración del reporte no tiene Qlik Automate asociado",
    );
  }
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    tenantQlikId: fila.tenantQlikId,
    creadoPorUsuarioId: fila.creadoPorUsuarioId,
    nombre: fila.nombre,
    flujoIdQlik: fila.flujoIdQlik,
    flujoNombreSnapshot: fila.flujoNombreSnapshot,
    ...(fila.flujoEspacioIdQlik
      ? { flujoEspacioIdQlik: fila.flujoEspacioIdQlik }
      : {}),
    destinoProveedor: fila.destinoProveedor,
    destinoIdExterno: fila.destinoIdExterno,
    destinoNombreSnapshot: fila.destinoNombreSnapshot,
    automatizacionIdQlik: fila.automatizacionIdQlik,
    automatizacionNombreSnapshot: fila.automatizacionNombreSnapshot,
    programar: fila.programar,
    estado: fila.estado as ConfiguracionReportePersistida["estado"],
    ...(fila.claveIdempotencia
      ? { claveIdempotencia: fila.claveIdempotencia }
      : {}),
  };
}

export type EstadoConfiguracionReporte =
  | "pendiente"
  | "creando"
  | "activa"
  | "error"
  | "desactivada"
  | "eliminada";

export interface CrearConfiguracionReportePersistida {
  organizacionId: string;
  tenantQlikId: string;
  creadoPorUsuarioId: string;
  nombre: string;
  flujoIdQlik: string;
  flujoNombreSnapshot: string;
  flujoEspacioIdQlik?: string;
  destinoProveedor: string;
  destinoIdExterno: string;
  destinoNombreSnapshot: string;
  automatizacionIdQlik: string;
  automatizacionNombreSnapshot: string;
  programar: boolean;
  estado: EstadoConfiguracionReporte;
  claveIdempotencia?: string;
}

export interface ConfiguracionReportePersistida
  extends CrearConfiguracionReportePersistida {
  id: string;
}

export interface PuertoRepositorioReportes {
  crearConfiguracion(
    entrada: CrearConfiguracionReportePersistida,
  ): Promise<ConfiguracionReportePersistida>;
  obtenerPorAutomatizacion(
    tenantQlikId: string,
    automatizacionIdQlik: string,
  ): Promise<ConfiguracionReportePersistida | null>;
}

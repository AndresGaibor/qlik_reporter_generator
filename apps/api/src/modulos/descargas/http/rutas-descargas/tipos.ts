import type { Context } from "hono";
import type { PuertoJobsBigQuery } from "../../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { ServicioQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../../aplicacion/puerto-almacenamiento-descargas.js";

export interface SesionDescarga {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
  correo?: string | null;
  roles?: Array<"admin" | "administrador" | "usuario">;
  esSuperadmin?: boolean;
}

export interface DependenciasRutasDescargas {
  resolverSesion(c: Context): Promise<SesionDescarga>;
  resolverQlik(c: Context): Promise<ServicioQlik>;
  repositorioReportes: PuertoRepositorioReportes;
  resolverAlmacenamiento(c: Context): Promise<PuertoAlmacenamientoDescargas>;
  resolverJobsBigQuery?: (c: Context) => Promise<PuertoJobsBigQuery>;
  resolverConfiguracionGcs?: (c: Context) => Promise<{
    bucket: string;
    prefijo: string;
    maximoFilasPorArchivo?: number;
  }>;
  resolverUsuariosOrganizacion?: (
    organizacionId: string,
  ) => Promise<Array<{ id: string; nombre?: string; correo: string | null }>>;
  minutosFirma?: number;
}

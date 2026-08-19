import { and, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { identidadesQlik } from "../../../plataforma/persistencia/esquema.js";
import type { PuertoConsultaIdentidadQlikAdmin } from "../aplicacion/puertos/repositorio-administracion.js";

export class ConsultaIdentidadQlikPostgres
  implements PuertoConsultaIdentidadQlikAdmin
{
  constructor(private readonly db: ConexionDb) {}

  async obtener(usuarioId: string, tenantQlikId: string) {
    const identidad = await this.db.query.identidadesQlik.findFirst({
      where: and(
        eq(identidadesQlik.usuarioId, usuarioId),
        eq(identidadesQlik.tenantQlikId, tenantQlikId),
      ),
    });
    return identidad
      ? {
          usuarioIdQlik: identidad.usuarioIdQlik,
          nombreQlik: identidad.nombreQlik,
          correoQlik: identidad.correoQlik,
        }
      : null;
  }
}

import { and, desc, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { automatizacionesPersonalesQlik } from "../../../plataforma/persistencia/esquema.js";
import type {
  ActualizarAutomatizacionPersonalPersistida,
  AutomatizacionPersonalPersistida,
  CrearAutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "../aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";

export class RepositorioAutomatizacionesPersonalesPostgres
  implements PuertoRepositorioAutomatizacionesPersonales
{
  constructor(private readonly db: ConexionDb) {}

  async obtener(
    usuarioId: string,
    tenantQlikId: string,
  ): Promise<AutomatizacionPersonalPersistida | null> {
    const fila = await this.db.query.automatizacionesPersonalesQlik.findFirst({
      where: and(
        eq(automatizacionesPersonalesQlik.usuarioId, usuarioId),
        eq(automatizacionesPersonalesQlik.tenantQlikId, tenantQlikId),
      ),
    });
    return fila ? mapear(fila) : null;
  }

  async crear(
    entrada: CrearAutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida> {
    const [fila] = await this.db
      .insert(automatizacionesPersonalesQlik)
      .values(entrada)
      .returning();
    if (!fila)
      throw new Error("No se pudo persistir la automatización personal");
    return mapear(fila);
  }

  async actualizar(
    id: string,
    cambios: ActualizarAutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida> {
    const [fila] = await this.db
      .update(automatizacionesPersonalesQlik)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(automatizacionesPersonalesQlik.id, id))
      .returning();
    if (!fila) throw new Error("No se encontró la automatización personal");
    return mapear(fila);
  }

  async listarPorTenant(
    tenantQlikId: string,
    organizacionId: string,
  ): Promise<AutomatizacionPersonalPersistida[]> {
    const filas = await this.db.query.automatizacionesPersonalesQlik.findMany({
      where: and(
        eq(automatizacionesPersonalesQlik.tenantQlikId, tenantQlikId),
        eq(automatizacionesPersonalesQlik.organizacionId, organizacionId),
      ),
      orderBy: [desc(automatizacionesPersonalesQlik.actualizadoEn)],
    });
    return filas.map(mapear);
  }
}

function mapear(
  fila: typeof automatizacionesPersonalesQlik.$inferSelect,
): AutomatizacionPersonalPersistida {
  return {
    ...fila,
    estado: fila.estado as AutomatizacionPersonalPersistida["estado"],
  };
}

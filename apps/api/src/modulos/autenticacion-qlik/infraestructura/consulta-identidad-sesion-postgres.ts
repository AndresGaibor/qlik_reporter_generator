import { eq } from "drizzle-orm";
import { identidadesQlik } from "../../../plataforma/persistencia/esquema.js";
import type { ConexionDb } from "../aplicacion/puertos/repositorio-autenticacion.js";

interface ReferenciaIdentidadSesion {
  identidadQlikId: string;
  usuarioId: string;
  tenantQlikActivoId: string;
}

export async function obtenerIdentidadDeSesion(
  db: ConexionDb,
  sesion: ReferenciaIdentidadSesion,
) {
  const identidad = await db.query.identidadesQlik.findFirst({
    where: eq(identidadesQlik.id, sesion.identidadQlikId),
  });

  if (
    !identidad ||
    identidad.id !== sesion.identidadQlikId ||
    identidad.usuarioId !== sesion.usuarioId ||
    identidad.tenantQlikId !== sesion.tenantQlikActivoId
  ) {
    return null;
  }

  return identidad;
}

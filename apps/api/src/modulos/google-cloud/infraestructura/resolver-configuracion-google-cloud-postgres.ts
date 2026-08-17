import { and, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import { conexionesDestino } from "../../../plataforma/persistencia/esquema.js";
import { servicioCifrado } from "../../../plataforma/seguridad/servicio-cifrado.js";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";

export interface ConfiguracionGoogleCloud {
  projectId: string;
  dataset: string;
  credencialesJson: string;
}

export class ResolverConfiguracionGoogleCloudPostgres {
  constructor(private readonly db: ConexionDb) {}

  async resolver(
    organizacionId: string,
    tenantQlikId: string,
  ): Promise<ConfiguracionGoogleCloud> {
    const fila = await this.db.query.conexionesDestino.findFirst({
      where: (tabla, { and, eq }) =>
        and(
          eq(tabla.organizacionId, organizacionId),
          eq(tabla.tenantQlikId, tenantQlikId),
          eq(tabla.tipo, "bigquery"),
          eq(tabla.esPredeterminada, true),
        ),
    });

    if (!fila) {
      throw new ErrorAplicacion(
        "GOOGLE_CLOUD_NO_CONFIGURADO",
        "La organización no tiene una conexión Google Cloud configurada",
        422,
      );
    }

    const config = fila.config as Record<string, unknown>;
    const projectId =
      typeof config.projectId === "string" ? config.projectId.trim() : "";
    const dataset =
      typeof config.dataset === "string" ? config.dataset.trim() : "";

    if (!projectId || !dataset) {
      throw new ErrorAplicacion(
        "GOOGLE_CLOUD_INCOMPLETO",
        "La conexión Google Cloud requiere projectId y dataset",
        422,
      );
    }

    const secretoRefs = fila.secretoRefs as Record<string, unknown>;
    let credencialesJson = "";

    if (
      secretoRefs.credencialesJson &&
      typeof secretoRefs.credencialesJson === "object"
    ) {
      const cifrado = secretoRefs.credencialesJson as {
        cifrado: string;
        iv: string;
        tag: string;
      };
      credencialesJson = servicioCifrado.descifrar(
        cifrado.cifrado,
        cifrado.iv,
        cifrado.tag,
      );
    }

    return { projectId, dataset, credencialesJson };
  }
}

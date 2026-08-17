import { servicioCifrado } from "../../../plataforma/seguridad/servicio-cifrado.js";
import type { TipoDestino } from "../dominio/tipos-destino.js";
import { ClienteBigQuery } from "../infraestructura/cliente-bigquery.js";
import type { OpcionesBigQuery } from "../infraestructura/cliente-bigquery.js";
import type { PuertoDestino } from "./puertos/puerto-destino.js";

export interface ConfigConexionDestino {
  tipo: TipoDestino;
  config: Record<string, unknown>;
  secretoRefs?: Record<string, unknown>;
}

function resolverCredencialesJson(
  secretoRefs?: Record<string, unknown>,
): string | undefined {
  if (!secretoRefs?.credencialesJson) return undefined;

  const ref = secretoRefs.credencialesJson;
  if (typeof ref === "string") {
    return ref;
  }

  if (
    typeof ref === "object" &&
    ref !== null &&
    "cifrado" in ref &&
    "iv" in ref &&
    "tag" in ref
  ) {
    const cifradoObj = ref as { cifrado?: string; iv?: string; tag?: string };
    if (cifradoObj.cifrado && cifradoObj.iv && cifradoObj.tag) {
      return servicioCifrado.descifrar(
        cifradoObj.cifrado,
        cifradoObj.iv,
        cifradoObj.tag,
      );
    }
  }

  return undefined;
}

export function crearClienteDestino(
  conexion: ConfigConexionDestino,
): PuertoDestino {
  if (conexion.tipo !== "bigquery") {
    throw new Error(`Tipo de destino no soportado: ${conexion.tipo}`);
  }
  const opts = conexion.config as Partial<OpcionesBigQuery>;
  return new ClienteBigQuery({
    projectId: opts.projectId ?? "",
    dataset: opts.dataset ?? "",
    credencialesJson: resolverCredencialesJson(conexion.secretoRefs),
    limiteMiB: typeof opts.limiteMiB === "number" ? opts.limiteMiB : undefined,
    limiteUsd: typeof opts.limiteUsd === "number" ? opts.limiteUsd : undefined,
    precioUsdPorTib:
      typeof opts.precioUsdPorTib === "number"
        ? opts.precioUsdPorTib
        : undefined,
  });
}

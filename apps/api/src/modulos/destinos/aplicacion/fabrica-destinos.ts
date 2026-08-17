import type { PuertoDestino } from "./puertos/puerto-destino.js";
import { ClienteBigQuery } from "../infraestructura/cliente-bigquery.js";
import type { OpcionesBigQuery } from "../infraestructura/cliente-bigquery.js";
import type { TipoDestino } from "../dominio/tipos-destino.js";
import { servicioCifrado } from "../../../plataforma/seguridad/servicio-cifrado.js";

export interface ConfigConexionDestino {
  tipo: TipoDestino;
  config: Record<string, unknown>;
  secretoRefs?: Record<string, unknown>;
}

export function crearClienteDestino(conexion: ConfigConexionDestino): PuertoDestino {
  if (conexion.tipo !== "bigquery") {
    throw new Error(`Tipo de destino no soportado: ${conexion.tipo}`);
  }
  const opts = conexion.config as Partial<OpcionesBigQuery>;
  return new ClienteBigQuery({
    projectId: opts.projectId ?? "",
    dataset: opts.dataset ?? "",
    credencialesJson: conexion.secretoRefs?.credencialesJson
      ? servicioCifrado.descifrar(
          (conexion.secretoRefs.credencialesJson as { cifrado: string }).cifrado,
          (conexion.secretoRefs.credencialesJson as { iv: string }).iv,
          (conexion.secretoRefs.credencialesJson as { tag: string }).tag,
        )
      : undefined,
    limiteMiB: typeof opts.limiteMiB === "number" ? opts.limiteMiB : undefined,
    limiteUsd: typeof opts.limiteUsd === "number" ? opts.limiteUsd : undefined,
    precioUsdPorTib: typeof opts.precioUsdPorTib === "number" ? opts.precioUsdPorTib : undefined,
  });
}

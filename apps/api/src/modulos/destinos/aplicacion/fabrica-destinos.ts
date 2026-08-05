import type { PuertoDestino } from "./puertos/puerto-destino.js";
import { ClientePostgres } from "../infraestructura/cliente-postgres.js";
import { ClienteBigQuery } from "../infraestructura/cliente-bigquery.js";
import { ClienteSftp } from "../infraestructura/cliente-sftp.js";
import type { OpcionesPostgres } from "../infraestructura/cliente-postgres.js";
import type { OpcionesBigQuery } from "../infraestructura/cliente-bigquery.js";
import type { OpcionesSftp } from "../infraestructura/cliente-sftp.js";
import type { TipoDestino } from "../dominio/tipos-destino.js";
import { servicioCifrado } from "../../../plataforma/seguridad/servicio-cifrado.js";

export interface ConfigConexionDestino {
  tipo: TipoDestino;
  config: Record<string, unknown>;
  secretoRefs?: Record<string, unknown>;
}

export function crearClienteDestino(conexion: ConfigConexionDestino): PuertoDestino {
  switch (conexion.tipo) {
    case "postgres": {
      const opts = conexion.config as Partial<OpcionesPostgres>;
      return new ClientePostgres({
        host: opts.host ?? "",
        port: opts.port,
        database: opts.database ?? "",
        user: opts.user ?? "",
        password: opts.password ?? "",
        ssl: opts.ssl,
      });
    }
    case "bigquery": {
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
    case "sftp": {
      const opts = conexion.config as Partial<OpcionesSftp>;
      return new ClienteSftp({
        host: opts.host ?? "",
        port: opts.port,
        user: opts.user ?? "",
        password: opts.password,
        privateKey: opts.privateKey,
        rutaBase: opts.rutaBase,
      });
    }
    default:
      throw new Error(`Tipo de destino no soportado: ${conexion.tipo}`);
  }
}

import type { ConfiguracionAplicacion } from "../../../plataforma/configuracion/entorno.js";
import { db } from "../../../plataforma/persistencia/conexion.js";
import { servicioCifrado } from "../../../plataforma/seguridad/servicio-cifrado.js";
import { RepositorioConfiguracionOAuthPostgres } from "../../autenticacion-qlik/infraestructura/repositorio-configuracion-oauth-postgres.js";
import { BloqueoEjecucionPostgres } from "../../automatizaciones/infraestructura/bloqueo-postgres.js";
import { iniciarBucleProgramadorReportes } from "../aplicacion/bucle-programador.js";
import { ProgramadorReportes } from "../aplicacion/programador-reportes.js";
import { RepositorioReportesPostgres } from "./repositorio-reportes-postgres.js";
import { ResolverContextoProgramadoPostgres } from "./resolver-contexto-programado-postgres.js";

export function iniciarProgramadorReportesAplicacion(
  configuracion: ConfiguracionAplicacion,
): { detener(): void } {
  const repositorio = new RepositorioReportesPostgres(db);
  const bloqueos = new BloqueoEjecucionPostgres(db);
  const scopes = (configuracion.QLIK_OAUTH_SCOPES ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const oauth = new RepositorioConfiguracionOAuthPostgres(db, servicioCifrado, {
    ...(configuracion.QLIK_CLIENT_ID
      ? { clienteId: configuracion.QLIK_CLIENT_ID }
      : {}),
    ...(configuracion.QLIK_CLIENT_SECRET
      ? { clienteSecreto: configuracion.QLIK_CLIENT_SECRET }
      : {}),
    scopes,
  });
  const resolver = new ResolverContextoProgramadoPostgres(
    db,
    servicioCifrado,
    oauth,
    configuracion.QLIK_REDIRECT_URI,
  );
  const programador = new ProgramadorReportes(
    repositorio,
    bloqueos,
    resolver.resolver.bind(resolver),
  );

  return iniciarBucleProgramadorReportes(programador, {
    intervaloMs: 30_000,
    onError: (error) => {
      console.error("Error al procesar programaciones de reportes", error);
    },
  });
}

import { Hono } from "hono";
import type { PuertoAuditoria } from "../../../nucleo/auditoria/puerto-auditoria.js";
import type { ServicioQlik } from "../../qlik/publico.js";
import type { PuertoRepositorioAutomatizacionesPersonales } from "../../reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import type { RepositorioAdministracion } from "../aplicacion/puertos/repositorio-administracion.js";
import type { PuertoConsultaIdentidadQlikAdmin } from "../aplicacion/puertos/repositorio-administracion.js";
import { crearRutasAutomatizacionesPersonales } from "./rutas-automatizaciones-personales.js";
import type { ResolverContextoAdmin } from "./rutas-comunes.js";
import {
  type OpcionesConfiguracionOAuth,
  crearRutasConfiguracionOAuth,
} from "./rutas-configuracion-oauth.js";
import { crearRutasConfiguracionTenant } from "./rutas-configuracion-tenant.js";
import { crearRutasSuperadmins } from "./rutas-superadmins.js";
import { crearRutasTenantsQlik } from "./rutas-tenants-qlik.js";
import { crearRutasTenants } from "./rutas-tenants.js";
import { crearRutasUsuarios } from "./rutas-usuarios.js";

export type { ResolverContextoAdmin };

export interface DependenciasRutasAdmin extends OpcionesConfiguracionOAuth {
  repositorio: RepositorioAdministracion;
  resolverContexto: ResolverContextoAdmin;
  auditoria: PuertoAuditoria;
  obtenerBigQuery?: Parameters<
    typeof crearRutasConfiguracionTenant
  >[0]["obtenerBigQuery"];
  guardarBigQuery?: Parameters<
    typeof crearRutasConfiguracionTenant
  >[0]["guardarBigQuery"];
  resolverQlik?: (c: import("hono").Context) => Promise<ServicioQlik>;
  repositorioAutomatizacionesPersonales?: PuertoRepositorioAutomatizacionesPersonales;
  resolverIdentidadQlik?: PuertoConsultaIdentidadQlikAdmin;
}

export function crearRutasAdmin({
  repositorio,
  resolverContexto,
  redirectUri,
  configuracionHeredada,
  auditoria,
  obtenerBigQuery,
  guardarBigQuery,
  resolverQlik,
  repositorioAutomatizacionesPersonales,
  resolverIdentidadQlik,
}: DependenciasRutasAdmin) {
  const rutas = new Hono();

  rutas.route("/", crearRutasTenants({ repositorio, resolverContexto }));
  rutas.route("/", crearRutasUsuarios({ repositorio, resolverContexto }));
  rutas.route("/", crearRutasTenantsQlik({ repositorio, resolverContexto }));
  rutas.route(
    "/",
    crearRutasConfiguracionTenant({
      repositorio,
      resolverContexto,
      obtenerBigQuery,
      guardarBigQuery,
      resolverQlik,
    }),
  );
  if (
    repositorioAutomatizacionesPersonales &&
    resolverIdentidadQlik &&
    resolverQlik
  ) {
    rutas.route(
      "/",
      crearRutasAutomatizacionesPersonales({
        repositorio,
        repositorioAutomatizacionesPersonales,
        resolverIdentidadQlik,
        resolverContexto,
        resolverQlik,
      }),
    );
  }
  rutas.route(
    "/",
    crearRutasConfiguracionOAuth({
      repositorio,
      resolverContexto,
      redirectUri,
      configuracionHeredada,
      auditoria,
    }),
  );
  rutas.route("/", crearRutasSuperadmins({ repositorio, resolverContexto }));

  return rutas;
}

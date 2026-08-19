import { esquemaSesionPublica } from "@qlik/contratos/autenticacion";
import { and, desc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  RepositorioAdministracionPostgres,
  ServicioBigQueryAdminPostgres,
} from "./modulos/admin/infraestructura/publico.js";
import {
  type ContextoSesion,
  type RepositorioAdministracion,
  type ResolverContextoAdmin,
  crearRutasAdmin,
} from "./modulos/admin/publico.js";
import {
  ClienteOAuthQlik,
  RepositorioAutenticacionPostgres,
  RepositorioConfiguracionOAuthPostgres,
} from "./modulos/autenticacion-qlik/infraestructura/publico.js";
import {
  type RepositorioAutenticacion,
  ServicioAutenticacionQlik,
  crearRutasAutenticacionQlik,
} from "./modulos/autenticacion-qlik/publico.js";
import type { PuertoBloqueoEjecucion } from "./modulos/automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoConsultaTenantQlik } from "./modulos/automatizaciones/aplicacion/puertos/puerto-consulta-tenant-qlik.js";
import { ConsultaTenantQlikPostgres } from "./modulos/automatizaciones/infraestructura/consulta-tenant-qlik-postgres.js";
import { BloqueoEjecucionPostgres } from "./modulos/automatizaciones/infraestructura/publico.js";
import { crearRutasPanelAutomatizaciones } from "./modulos/automatizaciones/publico.js";
import { crearRutasDescargas } from "./modulos/descargas/http/rutas-descargas.js";
import { ClienteGcs } from "./modulos/descargas/infraestructura/cliente-gcs.js";
import { ConsultaFlujosQlik } from "./modulos/flujos/infraestructura/consulta-flujos-qlik.js";
import { crearRutasFlujos } from "./modulos/flujos/publico.js";
import { EstimadorBigQuery } from "./modulos/google-cloud/infraestructura/estimador-bigquery.js";
import { ResolverConfiguracionGoogleCloudPostgres } from "./modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.js";
import { ClienteHttpQlik } from "./modulos/qlik/infraestructura/publico.js";
import {
  type ServicioQlik,
  crearRutasProxyQlik,
} from "./modulos/qlik/publico.js";
import { EjecutarReporte } from "./modulos/reportes/aplicacion/ejecutar-reporte.js";
import { ObtenerOCrearAutomatizacionPersonal } from "./modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.js";
import type { PuertoRepositorioAutomatizacionesPersonales } from "./modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import type { PuertoRepositorioReportes } from "./modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import {
  type ResolucionBigQueryReporte,
  crearRutasReportesDataflow,
} from "./modulos/reportes/http/rutas-reportes-dataflow.js";
import { RepositorioAutomatizacionesPersonalesPostgres } from "./modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.js";
import { RepositorioReportesPostgres } from "./modulos/reportes/infraestructura/repositorio-reportes-postgres.js";
import { ConfiguracionAppPostgres } from "./modulos/setup/infraestructura/configuracion-app-postgres.js";
import { crearRutasSetup } from "./modulos/setup/publico.js";
import type { PuertoAuditoria } from "./nucleo/auditoria/puerto-auditoria.js";
import {
  ErrorAplicacion,
  ErrorNoAutorizado,
} from "./nucleo/errores/error-aplicacion.js";
import type { PuertoIdempotencia } from "./nucleo/idempotencia/puerto-idempotencia.js";
import { generarUuid } from "./nucleo/valores/generar-uuid.js";
import { ejecutarBootstrap } from "./plataforma/bootstrap/bootstrap.js";
import { RepositorioBootstrapPostgres } from "./plataforma/bootstrap/repositorio-bootstrap-postgres.js";
import type { ConfiguracionAplicacion } from "./plataforma/configuracion/entorno.js";
import {
  type ContextoSolicitudAutenticado,
  construirContextoSolicitud,
} from "./plataforma/contexto/contexto-solicitud.js";
import { crearManejadorErrores } from "./plataforma/errores/manejador-http.js";
import { crearMiddlewareCabecerasSeguridad } from "./plataforma/http/middlewares/cabeceras-seguridad.js";
import { crearMiddlewareCors } from "./plataforma/http/middlewares/cors.js";
import { crearMiddlewareLimiteSolicitudes } from "./plataforma/http/middlewares/limite-solicitudes.js";
import { crearMiddlewareObservabilidad } from "./plataforma/http/middlewares/observabilidad.js";
import { crearMiddlewareOrigenCsrf } from "./plataforma/http/middlewares/origen-csrf.js";
import {
  responderError,
  responderExito,
} from "./plataforma/http/respuestas.js";
import {
  type Registrador,
  registradorConsola,
} from "./plataforma/observabilidad/registrador.js";
import { AuditoriaPostgres } from "./plataforma/persistencia/auditoria-postgres.js";
import { db, dbHolder } from "./plataforma/persistencia/conexion.js";
import {
  appConfig,
  conexionesDestino,
  tenantsQlik,
} from "./plataforma/persistencia/esquema.js";
import { IdempotenciaPostgres } from "./plataforma/persistencia/idempotencia-postgres.js";
import { servicioCifrado } from "./plataforma/seguridad/servicio-cifrado.js";

export interface DependenciasAplicacion {
  configuracion?: ConfiguracionAplicacion;
  registrador?: Registrador;
  repositorioAutenticacion?: RepositorioAutenticacion;
  servicioAutenticacion?: ServicioAutenticacionQlik;
  resolverQlik?: (c: Context) => Promise<ServicioQlik>;
  resolverBigQueryReporte?: (c: Context) => Promise<ResolucionBigQueryReporte>;
  repositorioReportes?: PuertoRepositorioReportes;
  consultaTenantQlik?: PuertoConsultaTenantQlik;
  repositorioAutomatizacionesPersonales?: PuertoRepositorioAutomatizacionesPersonales;
  bloqueoEjecucion?: PuertoBloqueoEjecucion;
  resolverSesion?: (c: Context) => Promise<{
    tenantId: string;
    usuarioId: string;
    organizacionId: string;
    usuarioIdQlik: string;
  }>;

  idempotencia?: PuertoIdempotencia;
  auditoria?: PuertoAuditoria;
  repositorioAdministracion?: RepositorioAdministracion;
  resolverContextoAdmin?: ResolverContextoAdmin;
}

export async function crearAplicacion(
  dependencias: DependenciasAplicacion = {},
): Promise<Hono> {
  const configuracion = dependencias.configuracion;
  const registrador = dependencias.registrador ?? registradorConsola;
  const frontendUrlGuardado = await obtenerFrontendUrlGuardado();
  const frontendUrl =
    frontendUrlGuardado ??
    configuracion?.FRONTEND_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:4525";
  const produccion =
    (configuracion?.NODE_ENV ?? process.env.NODE_ENV) === "production";
  const redirectUriConfigurado =
    process.env.QLIK_REDIRECT_URI ?? configuracion?.QLIK_REDIRECT_URI;
  const redirectUriOAuth = frontendUrlGuardado
    ? new URL("/api/auth/qlik/callback", frontendUrl).toString()
    : (redirectUriConfigurado ??
      "http://localhost:4523/api/auth/qlik/callback");

  const configuracionApp = new ConfiguracionAppPostgres(db);
  await servicioCifrado.inicializarConDb(configuracionApp);

  const repositorioAutenticacion =
    dependencias.repositorioAutenticacion ??
    new RepositorioAutenticacionPostgres(
      db,
      servicioCifrado,
      configuracion?.SUPERADMINMAIL,
    );
  const servicioAutenticacion =
    dependencias.servicioAutenticacion ??
    crearServicioAutenticacionDiferido(
      repositorioAutenticacion,
      configuracion,
      redirectUriOAuth,
    );
  const resolverContextoSolicitud = crearResolverContextoSolicitud(
    repositorioAutenticacion,
  );
  const resolverSesion =
    dependencias.resolverSesion ??
    (async (c) => {
      const contexto = await resolverContextoSolicitud(c);
      return {
        tenantId: contexto.tenantQlikId,
        usuarioId: contexto.usuarioId,
        organizacionId: contexto.organizacionId,
        usuarioIdQlik: contexto.usuarioIdQlik,
        esSuperadmin: contexto.esSuperadmin ?? false,
        roles: contexto.roles ?? [],
      };
    });
  const resolverQlik =
    dependencias.resolverQlik ??
    (async (c) => {
      const contexto = await resolverContextoSolicitud(c);
      const credenciales = await repositorioAutenticacion.obtenerCredenciales({
        sesionId: contexto.sesionId,
        usuarioId: contexto.usuarioId,
        identidadQlikId: contexto.identidadQlikId,
        usuarioIdQlik: contexto.usuarioIdQlik,
        tenantId: contexto.tenantQlikId,
        tenantHost: contexto.tenantHost,
        organizacionId: contexto.organizacionId,
      });
      if (!credenciales)
        throw new ErrorNoAutorizado("El tenant activo requiere conexión Qlik");
      return new ClienteHttpQlik(credenciales.host, credenciales.token);
    });

  const resolverGoogle = new ResolverConfiguracionGoogleCloudPostgres(db);

  const resolverBigQueryReporte =
    dependencias.resolverBigQueryReporte ??
    (async (c: Context): Promise<ResolucionBigQueryReporte> => {
      const sesion = await resolverSesion(c);
      let google: Awaited<ReturnType<typeof resolverGoogle.resolver>>;
      try {
        google = await resolverGoogle.resolver(
          sesion.organizacionId,
          sesion.tenantId,
        );
      } catch (error) {
        if (error instanceof ErrorAplicacion) {
          if (error.codigo === "GOOGLE_CLOUD_NO_CONFIGURADO") {
            throw new ErrorAplicacion(
              "BIGQUERY_NO_CONFIGURADO",
              "La organización no tiene una conexión BigQuery predeterminada",
              422,
            );
          }
          if (error.codigo === "GOOGLE_CLOUD_INCOMPLETO") {
            throw new ErrorAplicacion(
              "BIGQUERY_INCOMPLETO",
              "La conexión BigQuery predeterminada requiere proyecto y dataset",
              422,
            );
          }
        }
        throw error;
      }
      const estimador = new EstimadorBigQuery({
        projectId: google.projectId,
        dataset: google.dataset,
        credencialesJson: google.credencialesJson || undefined,
      });
      return {
        projectId: google.projectId,
        dataset: google.dataset,
        estimador: {
          estimarConsulta: estimador.estimarConsulta.bind(estimador),
        },
      };
    });

  const idempotencia = dependencias.idempotencia ?? new IdempotenciaPostgres();
  const auditoria = dependencias.auditoria ?? new AuditoriaPostgres();
  const repositorioAdministracion =
    dependencias.repositorioAdministracion ??
    new RepositorioAdministracionPostgres(db, servicioCifrado);
  const resolverContextoAdmin =
    dependencias.resolverContextoAdmin ??
    (async (c) => {
      const contexto = await resolverContextoSolicitud(c);
      const sesion = await repositorioAutenticacion.consultarSesion(
        getCookie(c, "sesion_usuario") ?? "",
      );
      if (!sesion) throw new Error("Sesión inválida");
      return {
        esSuperadmin: contexto.esSuperadmin ?? false,
        usuarioId: contexto.usuarioId,
        membresias: sesion.membresias,
      };
    });

  const aplicacion = new Hono();
  const scopesOAuthHeredados = (
    configuracion?.QLIK_OAUTH_SCOPES ??
    process.env.QLIK_OAUTH_SCOPES ??
    ""
  )
    .split(/\s+/)
    .filter(Boolean);

  aplicacion.use("*", await crearMiddlewareCors(db, frontendUrl));
  aplicacion.use("*", crearMiddlewareCabecerasSeguridad(produccion));
  aplicacion.use("*", crearMiddlewareObservabilidad(registrador));
  aplicacion.use("*", crearMiddlewareOrigenCsrf(db, frontendUrl));
  aplicacion.use(
    "*",
    crearMiddlewareLimiteSolicitudes([
      {
        ruta: "/api/auth/qlik/iniciar",
        metodos: ["GET"],
        maximo: 10,
        ventanaMs: 60_000,
      },
      {
        ruta: "/api/auth/qlik/iniciar-por-correo",
        metodos: ["GET"],
        maximo: 10,
        ventanaMs: 60_000,
      },
      {
        ruta: "/api/auth/qlik/callback",
        metodos: ["GET"],
        maximo: 20,
        ventanaMs: 60_000,
      },
      {
        ruta: "/api/setup/complete",
        metodos: ["POST"],
        maximo: 5,
        ventanaMs: 60_000,
      },
    ]),
  );

  aplicacion.get("/api/salud", (c) =>
    responderExito(c, {
      estado: "ok",
      fecha: new Date().toISOString(),
      arquitectura: "monolito-modular",
    }),
  );

  const repoOAuthSetup = new RepositorioConfiguracionOAuthPostgres(
    db,
    servicioCifrado,
    {},
  );

  aplicacion.route(
    "/api/setup",
    crearRutasSetup(
      new ConfiguracionAppPostgres(db),
      async (entrada) => {
        const resultado = await ejecutarBootstrap(
          new RepositorioBootstrapPostgres(dbHolder.client),
          entrada,
        );
        return {
          organizacionId: resultado.organizacionId,
          tenantQlikId: resultado.tenantQlikId,
          superadminId: resultado.superadministradorId,
        };
      },
      repoOAuthSetup.guardarOAuthInicial.bind(repoOAuthSetup),
    ),
  );

  // Composition root: único archivo que construye y conecta adaptadores.
  aplicacion.route(
    "/api/auth/qlik",
    crearRutasAutenticacionQlik(servicioAutenticacion, {
      frontendUrl,
      produccion,
      registrador,
    }),
  );

  const repositorioReportes =
    dependencias.repositorioReportes ?? new RepositorioReportesPostgres(db);
  const consultaTenantAutomatizaciones =
    dependencias.consultaTenantQlik ?? new ConsultaTenantQlikPostgres();
  const bloqueosEjecucion =
    dependencias.bloqueoEjecucion ?? new BloqueoEjecucionPostgres(db);
  const repositorioWorkers =
    dependencias.repositorioAutomatizacionesPersonales ??
    new RepositorioAutomatizacionesPersonalesPostgres(db);
  aplicacion.route(
    "/api/qlik/automatizaciones",
    crearRutasPanelAutomatizaciones({
      resolverQlik,
      resolverSesion,
      consultaTenant: consultaTenantAutomatizaciones,
    }),
  );
  aplicacion.route(
    "/api/reportes",
    crearRutasReportesDataflow({
      resolverQlik,
      resolverBigQuery: resolverBigQueryReporte,
      resolverSesion,
      repositorioReportes,
      resolverEjecutarReporte: async (c) => {
        const sesion = await resolverSesion(c);
        const tenant = await consultaTenantAutomatizaciones.obtenerTenant(
          sesion.tenantId,
        );
        if (!tenant?.automatizacionBaseIdQlik) {
          throw new ErrorAplicacion(
            "SIN_AUTOMATIZACION_BASE",
            "El tenant no tiene configurada una automatización base para crear el worker personal",
            422,
          );
        }
        const [qlik, bigQuery] = await Promise.all([
          resolverQlik(c),
          resolverBigQueryReporte(c),
        ]);
        const worker = new ObtenerOCrearAutomatizacionPersonal(
          qlik,
          repositorioWorkers,
          bloqueosEjecucion,
        );
        const caso = new EjecutarReporte(
          qlik,
          repositorioReportes,
          bloqueosEjecucion,
          bigQuery,
          generarUuid,
          (entrada) => ({
            organizacionId: entrada.organizacionId,
            tenantQlikId: entrada.tenantId,
            usuarioId: entrada.usuarioId,
            usuarioIdQlik: entrada.usuarioIdQlik,
            plantillaIdQlik: tenant.automatizacionBaseIdQlik as string,
            plantillaNombre:
              tenant.automatizacionBaseNombre ?? "Automatización base",
          }),
          worker,
        );
        return caso.ejecutar.bind(caso);
      },
    }),
  );
  aplicacion.route("/api/qlik", crearRutasProxyQlik(resolverQlik));
  aplicacion.route(
    "/api/flujos",
    crearRutasFlujos(
      async (c) => new ConsultaFlujosQlik(await resolverQlik(c)),
      resolverQlik,
      {
        resolverSesion,
        obtenerTenant: (tenantId) =>
          new ConsultaTenantQlikPostgres().obtenerTenant(tenantId),
      },
    ),
  );
  const servicioBigQueryAdmin = new ServicioBigQueryAdminPostgres(
    db,
    servicioCifrado,
  );

  aplicacion.route(
    "/api/admin",
    crearRutasAdmin({
      repositorio: repositorioAdministracion,
      resolverContexto: resolverContextoAdmin,
      obtenerBigQuery: servicioBigQueryAdmin.obtenerBigQuery.bind(
        servicioBigQueryAdmin,
      ),
      guardarBigQuery: servicioBigQueryAdmin.guardarBigQuery.bind(
        servicioBigQueryAdmin,
      ),
      redirectUri: redirectUriOAuth,
      configuracionHeredada: {
        clienteId: configuracion?.QLIK_CLIENT_ID ?? process.env.QLIK_CLIENT_ID,
        tieneSecreto: Boolean(
          configuracion?.QLIK_CLIENT_SECRET ?? process.env.QLIK_CLIENT_SECRET,
        ),
        scopes: scopesOAuthHeredados,
      },
      auditoria,
    }),
  );

  aplicacion.route(
    "/api/descargas",
    crearRutasDescargas({
      resolverSesion,
      resolverQlik,
      repositorioReportes,
      resolverAlmacenamiento: async (c) => {
        const sesion = await resolverSesion(c);
        const google = await resolverGoogle.resolver(
          sesion.organizacionId,
          sesion.tenantId,
        );
        return new ClienteGcs({
          projectId: google.projectId,
          credencialesJson: google.credencialesJson,
        });
      },
      minutosFirma: configuracion?.GOOGLE_SIGNED_URL_MINUTOS ?? 15,
    }),
  );

  aplicacion.notFound((c) =>
    responderError(c, "Ruta no encontrada", 404, {
      codigo: "RUTA_NO_ENCONTRADA",
    }),
  );
  aplicacion.onError(crearManejadorErrores(registrador));

  return aplicacion;
}

async function obtenerFrontendUrlGuardado(): Promise<string | null> {
  try {
    const fila = await db.query.appConfig.findFirst({
      where: (tabla, { eq }) => eq(tabla.clave, "frontend_url"),
    });
    const valor = fila?.valor;
    if (typeof valor !== "object" || valor === null) return null;
    const url = (valor as Record<string, unknown>).valor;
    if (typeof url !== "string") return null;
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function crearServicioAutenticacionDiferido(
  repositorio: RepositorioAutenticacion,
  configuracion?: ConfiguracionAplicacion,
  redirectUriOAuth?: string,
): ServicioAutenticacionQlik {
  const scopesHeredados = (
    configuracion?.QLIK_OAUTH_SCOPES ??
    process.env.QLIK_OAUTH_SCOPES ??
    ""
  )
    .split(/\s+/)
    .filter(Boolean);
  const configuracionesOAuth = new RepositorioConfiguracionOAuthPostgres(
    db,
    servicioCifrado,
    {
      clienteId: configuracion?.QLIK_CLIENT_ID ?? process.env.QLIK_CLIENT_ID,
      clienteSecreto:
        configuracion?.QLIK_CLIENT_SECRET ?? process.env.QLIK_CLIENT_SECRET,
      scopes: scopesHeredados,
    },
  );

  return new ServicioAutenticacionQlik(
    async (tenant, configuracionId) => {
      const credenciales = await configuracionesOAuth.obtenerParaTenant(
        tenant.id,
        configuracionId,
      );
      return {
        cliente: new ClienteOAuthQlik(
          credenciales.clienteId,
          credenciales.clienteSecreto,
          redirectUriOAuth ??
            configuracion?.QLIK_REDIRECT_URI ??
            exigirEntorno("QLIK_REDIRECT_URI"),
          tenant.host,
          credenciales.scopes.length
            ? credenciales.scopes.join(" ")
            : undefined,
          undefined,
          configuracion?.QLIK_OAUTH_TIMEOUT_MS ??
            (Number(process.env.QLIK_OAUTH_TIMEOUT_MS) || 10_000),
        ),
        configuracionId: credenciales.configuracionId,
        origen: credenciales.origen,
      };
    },
    repositorio,
    configuracionesOAuth,
  );
}

function crearResolverContextoSolicitud(repositorio: RepositorioAutenticacion) {
  const clave = "contextoSolicitud";
  return async (c: Context): Promise<ContextoSolicitudAutenticado> => {
    const existente = c.get(clave) as ContextoSolicitudAutenticado | undefined;
    if (existente) return existente;
    const token = getCookie(c, "sesion_usuario");
    if (!token) throw new ErrorNoAutorizado();
    const [info, publica] = await Promise.all([
      repositorio.obtenerInfoSesion(token),
      repositorio.consultarSesion(token),
    ]);
    if (!info || !publica)
      throw new ErrorNoAutorizado("Sesión inválida o expirada");
    const contexto = construirContextoSolicitud({
      solicitudId: (c.get("solicitudId") as string) ?? generarUuid(),
      sesion: info,
      sesionPublica: publica,
    });
    c.set(clave, contexto);
    return contexto;
  };
}

function exigirEntorno(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

import { esquemaSesionPublica } from "@qlik/contratos/autenticacion";
import { and, desc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { RepositorioAdministracionPostgres } from "./modulos/admin/infraestructura/publico.js";
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
import { ConsultaTenantQlikPostgres } from "./modulos/automatizaciones/infraestructura/consulta-tenant-qlik-postgres.js";
import { BloqueoEjecucionPostgres } from "./modulos/automatizaciones/infraestructura/publico.js";
import { crearRutasPanelAutomatizaciones } from "./modulos/automatizaciones/publico.js";
import {
  crearClienteDestino,
  crearRutasDestinosGenericas,
} from "./modulos/destinos/publico.js";
import { crearRutasFlujos } from "./modulos/flujos/publico.js";
import { ConsultaFlujosQlik } from "./modulos/flujos/infraestructura/consulta-flujos-qlik.js";
import { crearRutasDescargas } from "./modulos/descargas/http/rutas-descargas.js";
import { ClienteGcs } from "./modulos/descargas/infraestructura/cliente-gcs.js";
import { ResolverConfiguracionGoogleCloudPostgres } from "./modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.js";
import { ClienteHttpQlik } from "./modulos/qlik/infraestructura/publico.js";
import {
  type ServicioQlik,
  crearRutasProxyQlik,
} from "./modulos/qlik/publico.js";
import {
  type ResolucionBigQueryReporte,
  crearRutasReportesDataflow,
} from "./modulos/reportes/http/rutas-reportes-dataflow.js";
import { RepositorioReportesPostgres } from "./modulos/reportes/infraestructura/repositorio-reportes-postgres.js";
import { ConfiguracionAppPostgres } from "./modulos/setup/infraestructura/configuracion-app-postgres.js";
import { crearRutasSetup } from "./modulos/setup/publico.js";
import type { PuertoAuditoria } from "./nucleo/auditoria/puerto-auditoria.js";
import {
  ErrorAplicacion,
  ErrorNoAutorizado,
} from "./nucleo/errores/error-aplicacion.js";
import type { PuertoOutbox } from "./nucleo/eventos/puerto-outbox.js";
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
import { OutboxPostgres } from "./plataforma/persistencia/outbox-postgres.js";
import { servicioCifrado } from "./plataforma/seguridad/servicio-cifrado.js";

export interface DependenciasAplicacion {
  configuracion?: ConfiguracionAplicacion;
  registrador?: Registrador;
  repositorioAutenticacion?: RepositorioAutenticacion;
  servicioAutenticacion?: ServicioAutenticacionQlik;
  resolverQlik?: (c: Context) => Promise<ServicioQlik>;
  resolverBigQueryReporte?: (c: Context) => Promise<ResolucionBigQueryReporte>;
  resolverSesion?: (c: Context) => Promise<{
    tenantId: string;
    usuarioId: string;
    organizacionId: string;
    usuarioIdQlik: string;
  }>;

  idempotencia?: PuertoIdempotencia;
  outbox?: PuertoOutbox;
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

  await servicioCifrado.inicializarConDb({
    async guardar(clave, valor) {
      await db
        .insert(appConfig)
        .values({ clave, valor: valor as Record<string, unknown> })
        .onConflictDoUpdate({
          target: appConfig.clave,
          set: {
            valor: valor as Record<string, unknown>,
            actualizadoEn: new Date(),
          },
        });
    },
    async obtener(clave) {
      const fila = await db.query.appConfig.findFirst({
        where: (tc, { eq }) => eq(tc.clave, clave),
      });
      return fila?.valor ?? null;
    },
  });

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

  const resolverBigQueryReporte =
    dependencias.resolverBigQueryReporte ??
    (async (c: Context): Promise<ResolucionBigQueryReporte> => {
      const sesion = await resolverSesion(c);
      const fila = await db.query.conexionesDestino.findFirst({
        where: (tabla, operadores) =>
          operadores.and(
            operadores.eq(tabla.organizacionId, sesion.organizacionId),
            operadores.eq(tabla.tipo, "bigquery"),
            operadores.eq(tabla.esPredeterminada, true),
          ),
        orderBy: (tabla, operadores) => [operadores.desc(tabla.actualizadoEn)],
      });
      if (!fila) {
        throw new ErrorAplicacion(
          "BIGQUERY_NO_CONFIGURADO",
          "La organización no tiene una conexión BigQuery predeterminada",
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
          "BIGQUERY_INCOMPLETO",
          "La conexión BigQuery predeterminada requiere proyecto y dataset",
          422,
        );
      }
      const cliente = crearClienteDestino({
        tipo: "bigquery",
        config,
        secretoRefs: fila.secretoRefs as Record<string, unknown>,
      });
      const estimarConsulta = cliente.estimarConsulta?.bind(cliente);
      if (!estimarConsulta) {
        throw new ErrorAplicacion(
          "BIGQUERY_SIN_ESTIMACION",
          "La conexión BigQuery no permite estimar consultas",
          422,
        );
      }
      return {
        projectId,
        dataset,
        estimador: { estimarConsulta },
      };
    });

  const idempotencia = dependencias.idempotencia ?? new IdempotenciaPostgres();
  const outbox = dependencias.outbox ?? new OutboxPostgres();
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
  
  const repositorioReportes = new RepositorioReportesPostgres(db);
  aplicacion.route(
    "/api/reportes",
    crearRutasPanelAutomatizaciones({
      resolverQlik,
      resolverSesion,
      consultaTenant: new ConsultaTenantQlikPostgres(),
      bloqueos: new BloqueoEjecucionPostgres(db),
      idempotencia,
      outbox,
      auditoria,
      repositorioReportes,
      resolverBigQueryReporte,
    }),
  );
  aplicacion.route(
    "/api/reportes",
    crearRutasReportesDataflow({
      resolverQlik,
      resolverBigQuery: resolverBigQueryReporte,
      resolverSesion,
      repositorioReportes,
    }),
  );
  aplicacion.route(
    "/api/destinos/conexiones",
    crearRutasDestinosGenericas(
      async (c: Context) => {
        const sesion = await resolverSesion(c);
        const filas = await db.query.conexionesDestino.findMany({
          where: (t, { eq }) => eq(t.organizacionId, sesion.organizacionId),
          orderBy: (t, { desc }) => [
            desc(t.esPredeterminada),
            desc(t.actualizadoEn),
          ],
        });
        return filas.map((f) => ({
          id: f.id,
          tipo: f.tipo,
          nombre: f.nombre,
          estado: f.estado,
          mensajeError: f.mensajeError,
          config: f.config as Record<string, unknown>,
          secretoRefs: f.secretoRefs as Record<string, unknown>,
          esPredeterminada: f.esPredeterminada,
        }));
      },
      async (
        c: Context,
        conexion: {
          organizacionId: string;
          tipo: string;
          nombre: string;
          config: Record<string, unknown>;
          secretoRefs: Record<string, unknown>;
          esPredeterminada?: boolean;
        },
      ) => {
        const sesion = await resolverSesion(c);
        const [creada] = await db
          .insert(conexionesDestino)
          .values({
            organizacionId: sesion.organizacionId,
            tipo: conexion.tipo,
            nombre: conexion.nombre,
            config: conexion.config,
            secretoRefs: conexion.secretoRefs,
            estado: "activo",
            esPredeterminada: conexion.esPredeterminada ?? false,
          })
          .returning({ id: conexionesDestino.id });
        return { id: creada.id };
      },
      async (
        c: Context,
        id: string,
        cambios: {
          nombre?: string;
          config?: Record<string, unknown>;
          estado?: string;
          mensajeError?: string | null;
        },
      ) => {
        await db
          .update(conexionesDestino)
          .set({
            ...cambios,
            ...(cambios.config ? { config: cambios.config } : {}),
          })
          .where(eq(conexionesDestino.id, id));
      },
      async (c: Context, id: string) => {
        await db.delete(conexionesDestino).where(eq(conexionesDestino.id, id));
      },
      async (c: Context, id: string) => {
        const fila = await db.query.conexionesDestino.findFirst({
          where: (t, { eq }) => eq(t.id, id),
        });
        if (!fila) return null;
        return {
          id: fila.id,
          tipo: fila.tipo,
          nombre: fila.nombre,
          estado: fila.estado,
          mensajeError: fila.mensajeError,
          config: fila.config as Record<string, unknown>,
          secretoRefs: fila.secretoRefs as Record<string, unknown>,
          esPredeterminada: fila.esPredeterminada,
        };
      },
      async (c: Context) => (await resolverSesion(c)).organizacionId,
    ),
  );
  aplicacion.route("/api/qlik", crearRutasProxyQlik(resolverQlik));
  aplicacion.route(
    "/api/flujos",
    crearRutasFlujos(
      async (c) => new ConsultaFlujosQlik(await resolverQlik(c)),
      resolverQlik,
    ),
  );
  aplicacion.route(
    "/api/admin",
    crearRutasAdmin({
      repositorio: repositorioAdministracion,
      resolverContexto: resolverContextoAdmin,
      obtenerBigQuery: async (organizacionId, tenantQlikId) => {
        const fila = await db.query.conexionesDestino.findFirst({
          where: (tabla, { and, eq }) =>
            and(
              eq(tabla.organizacionId, organizacionId),
              eq(tabla.tenantQlikId, tenantQlikId),
              eq(tabla.tipo, "bigquery"),
              eq(tabla.esPredeterminada, true),
            ),
        });
        if (!fila) {
          return { configurada: false, credencialesConfiguradas: false };
        }
        const config = fila.config as Record<string, unknown>;
        const secretos = fila.secretoRefs as Record<string, unknown>;
        return {
          configurada: true,
          id: fila.id,
          estado: fila.estado as "activo" | "error" | "desconectado",
          projectId:
            typeof config.projectId === "string" ? config.projectId : undefined,
          dataset:
            typeof config.dataset === "string" ? config.dataset : undefined,
          clientEmail:
            typeof config.clientEmail === "string"
              ? config.clientEmail
              : undefined,
          credencialesConfiguradas: Boolean(secretos.credencialesJson),
          mensajeError: fila.mensajeError,
        };
      },
      guardarBigQuery: async (entrada) => {
        const existente = await db.query.conexionesDestino.findFirst({
          where: (tabla, { and, eq }) =>
            and(
              eq(tabla.organizacionId, entrada.organizacionId),
              eq(tabla.tenantQlikId, entrada.tenantQlikId),
              eq(tabla.tipo, "bigquery"),
              eq(tabla.esPredeterminada, true),
            ),
        });
        const secretosExistentes =
          (existente?.secretoRefs as Record<string, unknown> | undefined) ?? {};
        const secretoRefs = entrada.credencialesJson
          ? {
              ...secretosExistentes,
              credencialesJson: servicioCifrado.cifrar(
                entrada.credencialesJson,
              ),
            }
          : secretosExistentes;
        if (!secretoRefs.credencialesJson) {
          throw new Error("La cuenta de servicio BigQuery es obligatoria");
        }
        const config = {
          projectId: entrada.projectId,
          clientEmail: entrada.clientEmail,
          dataset: entrada.dataset,
          ...(entrada.limiteMiB === undefined
            ? {}
            : { limiteMiB: entrada.limiteMiB }),
          ...(entrada.limiteUsd === undefined
            ? {}
            : { limiteUsd: entrada.limiteUsd }),
          precioUsdPorTib: entrada.precioUsdPorTib,
        };
        const valores = {
          organizacionId: entrada.organizacionId,
          tenantQlikId: entrada.tenantQlikId,
          tipo: "bigquery",
          nombre: existente?.nombre ?? "BigQuery principal",
          config,
          secretoRefs,
          estado: "desconectado",
          mensajeError: null,
          esPredeterminada: true,
          actualizadoEn: new Date(),
        };
        const [fila] = existente
          ? await db
              .update(conexionesDestino)
              .set(valores)
              .where(eq(conexionesDestino.id, existente.id))
              .returning()
          : await db.insert(conexionesDestino).values(valores).returning();
        if (!fila) throw new Error("No se pudo guardar BigQuery");
        return {
          configurada: true,
          id: fila.id,
          estado: "desconectado" as const,
          projectId: entrada.projectId,
          dataset: entrada.dataset,
          clientEmail: entrada.clientEmail,
          credencialesConfiguradas: true,
          mensajeError: null,
        };
      },
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

  const resolverGoogle = new ResolverConfiguracionGoogleCloudPostgres(db);
  aplicacion.route(
    "/api/descargas",
    crearRutasDescargas({
      resolverSesion,
      resolverQlik,
      repositorioReportes,
      resolverAlmacenamiento: async (c) => {
        const sesion = await resolverSesion(c);
        const google = await resolverGoogle.resolver(sesion.organizacionId, sesion.tenantId);
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

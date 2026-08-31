import { type Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../nucleo/http/respuestas.js";
import type { Registrador } from "../../../plataforma/observabilidad/registrador.js";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { ServicioQlik } from "../../qlik/publico.js";
import type {
  AutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "../../reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js";
import {
  type ContextoAutomatizacionPersonal,
  ReemplazarAutomatizacionPersonal,
} from "../../reportes/aplicacion/reemplazar-automatizacion-personal.js";
import type {
  PuertoConsultaIdentidadQlikAdmin,
  RepositorioAdministracion,
  UsuarioAdministrable,
} from "../aplicacion/puertos/repositorio-administracion.js";
import type { ResolverContextoAdmin } from "./rutas-comunes.js";
import {
  exigirAccesoOrganizacion,
  obtenerParametroRequerido,
  responderErrorAdmin,
} from "./rutas-comunes.js";

export interface DependenciasRutasAutomatizacionesPersonales {
  repositorio: RepositorioAdministracion;
  repositorioAutomatizacionesPersonales: PuertoRepositorioAutomatizacionesPersonales;
  resolverIdentidadQlik: PuertoConsultaIdentidadQlikAdmin;
  resolverContexto: ResolverContextoAdmin;
  resolverQlik: (c: Context) => Promise<ServicioQlik>;
  bloqueoEjecucion?: PuertoBloqueoEjecucion;
  registrador?: Registrador;
  hayEjecucionesActivas?: (automatizacionIdQlik: string) => Promise<boolean>;
}

export function crearRutasAutomatizacionesPersonales(
  dependencias: DependenciasRutasAutomatizacionesPersonales,
) {
  const rutas = new Hono();

  rutas.get(
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/workers",
    async (c) => {
      try {
        const organizacionId = obtenerParametroRequerido(c, "id");
        const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
        exigirAccesoOrganizacion(
          await dependencias.resolverContexto(c),
          organizacionId,
        );
        const [workers, usuarios] = await Promise.all([
          dependencias.repositorioAutomatizacionesPersonales.listarPorTenant(
            tenantQlikId,
            organizacionId,
          ),
          dependencias.repositorio.listarUsuarios(organizacionId),
        ]);
        const usuariosPorId = new Map(
          usuarios.map((usuario) => [usuario.id, usuario]),
        );
        const datos = await Promise.all(
          workers.map(async (worker) => {
            const usuario = usuariosPorId.get(worker.usuarioId);
            const identidad = await dependencias.resolverIdentidadQlik.obtener(
              worker.usuarioId,
              tenantQlikId,
            );
            return mapearWorker(worker, usuario, identidad);
          }),
        );
        return responderExito(c, datos);
      } catch (error) {
        return responderErrorAdmin(c, error);
      }
    },
  );

  rutas.post(
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/workers/:workerId/recrear",
    async (c) => {
      try {
        const organizacionId = obtenerParametroRequerido(c, "id");
        const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
        const workerId = obtenerParametroRequerido(c, "workerId");
        exigirAccesoOrganizacion(
          await dependencias.resolverContexto(c),
          organizacionId,
        );
        const workers =
          await dependencias.repositorioAutomatizacionesPersonales.listarPorTenant(
            tenantQlikId,
            organizacionId,
          );
        const worker = workers.find((item) => item.id === workerId);
        if (!worker)
          return responderError(c, "Worker no encontrado", 404, {
            codigo: "NO_ENCONTRADO",
          });

        const tenant = (
          await dependencias.repositorio.listarTenantsQlik(organizacionId)
        ).find((item) => item.id === tenantQlikId);
        if (!tenant?.automatizacionBaseIdQlik) {
          throw new ErrorAplicacion(
            "SIN_AUTOMATIZACION_BASE",
            "Configura una automatización base para este tenant antes de recrear workers",
            422,
          );
        }
        const identidad = await dependencias.resolverIdentidadQlik.obtener(
          worker.usuarioId,
          tenantQlikId,
        );
        if (!identidad) {
          throw new ErrorAplicacion(
            "IDENTIDAD_QLIK_NO_ENCONTRADA",
            "El usuario no tiene una identidad Qlik vinculada en este tenant",
            422,
          );
        }

        const qlik = await dependencias.resolverQlik(c);
        const bloqueo = dependencias.bloqueoEjecucion ?? {
          ejecutarExclusivo: async <T>(
            _clave: string,
            tarea: () => Promise<T>,
          ) => tarea(),
        };
        const servicio = new ReemplazarAutomatizacionPersonal(
          qlik,
          dependencias.repositorioAutomatizacionesPersonales,
          bloqueo,
          dependencias.registrador,
          dependencias.hayEjecucionesActivas,
        );
        const contexto: ContextoAutomatizacionPersonal = {
          organizacionId,
          tenantQlikId,
          usuarioId: worker.usuarioId,
          usuarioIdQlik: identidad.usuarioIdQlik,
          plantillaIdQlik: tenant.automatizacionBaseIdQlik,
          plantillaNombre:
            tenant.automatizacionBaseNombre ?? "Automatización base",
        };
        return responderExito(c, await servicio.recrear(contexto, worker));
      } catch (error) {
        return responderErrorAdmin(c, error);
      }
    },
  );

  return rutas;
}

function mapearWorker(
  worker: AutomatizacionPersonalPersistida,
  usuario: UsuarioAdministrable | undefined,
  identidad: Awaited<ReturnType<PuertoConsultaIdentidadQlikAdmin["obtener"]>>,
) {
  return {
    id: worker.id,
    usuarioId: worker.usuarioId,
    usuarioNombre: usuario?.nombre ?? null,
    usuarioCorreo: usuario?.correo ?? null,
    usuarioIdQlik: identidad?.usuarioIdQlik ?? null,
    usuarioNombreQlik: identidad?.nombreQlik ?? null,
    usuarioCorreoQlik: identidad?.correoQlik ?? null,
    automatizacionIdQlik: worker.automatizacionIdQlik,
    automatizacionNombre: worker.automatizacionNombreSnapshot,
    estado: worker.estado,
    mensajeError: worker.mensajeError ?? null,
  };
}

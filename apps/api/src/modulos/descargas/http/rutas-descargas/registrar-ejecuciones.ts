import type { Hono } from "hono";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../../nucleo/http/respuestas.js";
import { SincronizarEjecucionesReporte } from "../../../reportes/aplicacion/sincronizar-ejecuciones-reporte.js";
import { ServicioDescargas } from "../../aplicacion/servicio-descargas.js";
import { esAdministrador } from "./helpers.js";
import type { DependenciasRutasDescargas } from "./tipos.js";

export function registrarRutasEjecuciones(
  rutas: Hono,
  dependencias: DependenciasRutasDescargas,
): void {
  rutas.get("/", async (c) => {
    const sesion = await dependencias.resolverSesion(c);

    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    const servicio = new ServicioDescargas(
      dependencias.repositorioReportes,
      almacenamiento,
      dependencias.minutosFirma ?? 15,
    );

    let ejecuciones = await servicio.listarEjecuciones({
      tenantQlikId: sesion.tenantId,
      organizacionId: sesion.organizacionId,
      usuarioId: sesion.usuarioId,
      esAdministrador: false,
    });

    const pendientes = ejecuciones.filter(
      (e) => e.estado === "preparando" || e.estado === "iniciada",
    );

    if (pendientes.length > 0) {
      const flujosDistintos = [
        ...new Set(
          pendientes
            .map((p) => p.flujoIdQlik)
            .filter((flujoIdQlik): flujoIdQlik is string =>
              Boolean(flujoIdQlik),
            ),
        ),
      ];

      const qlik = await dependencias.resolverQlik(c);

      await Promise.all(
        flujosDistintos.map((flujoIdQlik) =>
          new SincronizarEjecucionesReporte(
            qlik,
            dependencias.repositorioReportes,
          ).ejecutar(flujoIdQlik, sesion.tenantId, sesion.organizacionId),
        ),
      );

      ejecuciones = await servicio.listarEjecuciones({
        tenantQlikId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
        usuarioId: sesion.usuarioId,
        esAdministrador: false,
      });
    }

    return responderExito(c, ejecuciones);
  });

  rutas.get("/administracion", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) {
      return responderError(c, "Acceso restringido a administradores", 403, {
        codigo: "SOLO_ADMIN",
      });
    }
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    const servicio = new ServicioDescargas(
      dependencias.repositorioReportes,
      almacenamiento,
      dependencias.minutosFirma ?? 15,
    );
    const ejecuciones = await servicio.listarEjecuciones({
      tenantQlikId: sesion.tenantId,
      organizacionId: sesion.organizacionId,
      esAdministrador: true,
    });
    return responderExito(c, ejecuciones);
  });

  rutas.post("/:id/manifiesto", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const ejecucionId = c.req.param("id");

    const almacenamiento = await dependencias.resolverAlmacenamiento(c);

    const servicio = new ServicioDescargas(
      dependencias.repositorioReportes,
      almacenamiento,
      dependencias.minutosFirma ?? 15,
    );

    try {
      const manifiesto = await servicio.crearManifiesto(ejecucionId, {
        tenantQlikId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
        usuarioId: sesion.usuarioId,
        esAdministrador: esAdministrador(sesion),
      });

      return responderExito(c, manifiesto);
    } catch (error) {
      if (error instanceof ErrorAplicacion) {
        return responderError(
          c,
          error.message,
          error.estadoHttp as Parameters<typeof responderError>[2],
          {
            codigo: error.codigo,
            detalles: error.detalles,
          },
        );
      }
      throw error;
    }
  });
}

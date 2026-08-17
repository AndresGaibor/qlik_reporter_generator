import { type Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../nucleo/http/respuestas.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import { SincronizarEjecucionesReporte } from "../../reportes/aplicacion/sincronizar-ejecuciones-reporte.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { ServicioDescargas } from "../aplicacion/servicio-descargas.js";

interface SesionDescarga {
  tenantId: string;
  organizacionId: string;
  usuarioId: string;
}

export interface DependenciasRutasDescargas {
  resolverSesion(c: Context): Promise<SesionDescarga>;
  resolverQlik(c: Context): Promise<ServicioQlik>;
  repositorioReportes: PuertoRepositorioReportes;
  resolverAlmacenamiento(c: Context): Promise<PuertoAlmacenamientoDescargas>;
  minutosFirma?: number;
}

export function crearRutasDescargas(dependencias: DependenciasRutasDescargas) {
  const rutas = new Hono();

  rutas.get("/", async (c) => {
    const sesion = await dependencias.resolverSesion(c);

    const servicio = new ServicioDescargas(
      dependencias.repositorioReportes,
      {
        listar: async () => [],
        firmar: async () => "",
      },
      dependencias.minutosFirma ?? 15,
    );

    let ejecuciones = await servicio.listarEjecuciones({
      tenantQlikId: sesion.tenantId,
      organizacionId: sesion.organizacionId,
    });

    const pendientes = ejecuciones.filter(
      (e) => e.estado === "preparando" || e.estado === "iniciada",
    );

    if (pendientes.length > 0) {
      const automatizacionesDistintas = [
        ...new Set(pendientes.map((p) => p.automatizacionIdQlik)),
      ];

      const qlik = await dependencias.resolverQlik(c);

      await Promise.all(
        automatizacionesDistintas.map((automatizacionIdQlik) =>
          new SincronizarEjecucionesReporte(
            qlik,
            dependencias.repositorioReportes,
          ).ejecutar(sesion.tenantId, automatizacionIdQlik),
        ),
      );

      ejecuciones = await servicio.listarEjecuciones({
        tenantQlikId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
      });
    }

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

  return rutas;
}

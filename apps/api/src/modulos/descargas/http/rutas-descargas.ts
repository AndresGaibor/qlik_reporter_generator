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
  roles?: Array<"admin" | "administrador" | "usuario">;
  esSuperadmin?: boolean;
}

export interface DependenciasRutasDescargas {
  resolverSesion(c: Context): Promise<SesionDescarga>;
  resolverQlik(c: Context): Promise<ServicioQlik>;
  repositorioReportes: PuertoRepositorioReportes;
  resolverAlmacenamiento(c: Context): Promise<PuertoAlmacenamientoDescargas>;
  resolverConfiguracionGcs?: (
    c: Context,
  ) => Promise<{ bucket: string; prefijo: string }>;
  minutosFirma?: number;
}

export function crearRutasDescargas(dependencias: DependenciasRutasDescargas) {
  const rutas = new Hono();

  rutas.get("/explorador", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) {
      return responderError(c, "Acceso restringido a administradores", 403, {
        codigo: "SOLO_ADMIN",
      });
    }
    if (!dependencias.resolverConfiguracionGcs) {
      return responderError(
        c,
        "GCS no está configurado para exploración",
        422,
        { codigo: "GCS_NO_CONFIGURADO" },
      );
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const subruta = normalizarSubruta(c.req.query("ruta") ?? "");
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    if (!almacenamiento.listarDirectorio) {
      return responderError(
        c,
        "El almacenamiento no permite explorar carpetas",
        501,
        { codigo: "GCS_EXPLORADOR_NO_DISPONIBLE" },
      );
    }
    try {
      const resultado = await almacenamiento.listarDirectorio(
        `${configuracion.prefijo}${subruta}`,
      );
      return responderExito(c, {
        bucket: configuracion.bucket,
        prefijoBase: configuracion.prefijo,
        ruta: subruta,
        carpetas: resultado.carpetas,
        archivos: resultado.archivos.map((a) => ({
          nombre: a.nombre,
          formato: a.formato,
          tamano: a.tamanoBytes,
          fecha: a.fecha ?? null,
        })),
      });
    } catch (error) {
      return responderErrorGcs(c, error);
    }
  });
  rutas.post("/explorador/firma", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) {
      return responderError(c, "Acceso restringido a administradores", 403, {
        codigo: "SOLO_ADMIN",
      });
    }
    if (!dependencias.resolverConfiguracionGcs) {
      return responderError(
        c,
        "GCS no está configurado para exploración",
        422,
        { codigo: "GCS_NO_CONFIGURADO" },
      );
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const cuerpo = await c.req.json<{ ruta?: string }>();
    const ruta = typeof cuerpo.ruta === "string" ? cuerpo.ruta.trim() : "";
    if (
      !ruta.startsWith(configuracion.prefijo) ||
      ruta.replace(/\\/g, "/").split("/").includes("..") ||
      !esRutaDescargable(ruta)
    ) {
      return responderError(
        c,
        "El archivo solicitado está fuera de la ruta permitida",
        422,
        { codigo: "RUTA_GCS_NO_PERMITIDA" },
      );
    }
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      const url = await almacenamiento.firmar(
        ruta,
        dependencias.minutosFirma ?? 15,
      );
      return responderExito(c, {
        nombre: ruta.split("/").at(-1) ?? "archivo",
        url,
      });
    } catch (error) {
      return responderErrorGcs(c, error);
    }
  });
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

  return rutas;
}

function esAdministrador(sesion: SesionDescarga): boolean {
  return Boolean(
    sesion.esSuperadmin ||
      sesion.roles?.includes("admin") ||
      sesion.roles?.includes("administrador"),
  );
}

function normalizarSubruta(valor: string): string {
  const limpio = valor.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!limpio) return "";
  if (limpio.includes("..")) {
    throw new ErrorAplicacion(
      "RUTA_GCS_NO_PERMITIDA",
      "La ruta solicitada no es válida",
      422,
    );
  }
  return limpio.endsWith("/") ? limpio : `${limpio}/`;
}

function esRutaDescargable(ruta: string): boolean {
  const nombre = ruta.split("/").at(-1) ?? "";
  return (
    !nombre.startsWith("__finalizado__-") &&
    /\.(csv|csv\.gz|parquet)$/i.test(nombre)
  );
}
function responderErrorGcs(c: Context, error: unknown) {
  const codigo =
    typeof error === "object" && error !== null
      ? Number((error as Record<string, unknown>).code)
      : Number.NaN;
  if (codigo === 401 || codigo === 403) {
    return responderError(
      c,
      "La cuenta de servicio no tiene permisos para acceder al bucket",
      502,
      { codigo: "GCS_SIN_PERMISOS" },
    );
  }
  return responderError(c, "No se pudo consultar Google Cloud Storage", 502, {
    codigo: "GCS_NO_DISPONIBLE",
  });
}

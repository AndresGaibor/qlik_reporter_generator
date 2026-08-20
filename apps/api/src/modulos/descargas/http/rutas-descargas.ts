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
  correo?: string | null;
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
  resolverUsuariosOrganizacion?: (
    organizacionId: string,
  ) => Promise<Array<{ id: string; correo: string | null }>>;
  minutosFirma?: number;
}

export function crearRutasDescargas(dependencias: DependenciasRutasDescargas) {
  const rutas = new Hono();

  rutas.get("/carpeta", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario) {
      return responderError(c, "La cuenta no tiene un correo vÃƒÆ’Ã‚Â¡lido", 422, {
        codigo: "CORREO_USUARIO_NO_DISPONIBLE",
      });
    }
    if (!dependencias.resolverConfiguracionGcs) {
      return responderError(c, "GCS no estÃƒÆ’Ã‚Â¡ configurado", 422, {
        codigo: "GCS_NO_CONFIGURADO",
      });
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    if (!almacenamiento.listarDirectorio) {
      return responderError(
        c,
        "El almacenamiento no permite explorar carpetas",
        501,
        {
          codigo: "GCS_EXPLORADOR_NO_DISPONIBLE",
        },
      );
    }
    const subruta = normalizarSubruta(c.req.query("ruta") ?? "");
    try {
      const prefijoUsuario = `${configuracion.prefijo}${carpetaUsuario}/`;
      const resultado = await almacenamiento.listarDirectorio(
        `${prefijoUsuario}${subruta}`,
      );
      return responderExito(c, {
        bucket: configuracion.bucket,
        prefijoBase: prefijoUsuario,
        ruta: subruta,
        carpetaUsuario,
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
        "GCS no estÃƒÆ’Ã‚Â¡ configurado para exploraciÃƒÆ’Ã‚Â³n",
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
      const carpetaPropia = carpetaDesdeCorreo(sesion.correo);
      const carpetas = subruta
        ? resultado.carpetas
        : resultado.carpetas.filter(
            (carpeta) => carpeta.replace(/\/$/, "") !== carpetaPropia,
          );
      return responderExito(c, {
        bucket: configuracion.bucket,
        prefijoBase: configuracion.prefijo,
        ruta: subruta,
        carpetas,
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
  rutas.delete("/carpeta/archivo", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) return responderError(c, "Solo un administrador puede eliminar archivos", 403, { codigo: "SOLO_ADMIN" });
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs) return responderError(c, "No se pudo resolver la carpeta del usuario", 422, { codigo: "CARPETA_USUARIO_NO_DISPONIBLE" });
    let rutaRelativa: string;
    try { rutaRelativa = normalizarRutaArchivo(c.req.query("ruta") ?? ""); }
    catch (error) { if (error instanceof ErrorAplicacion) return responderError(c, error.message, error.estadoHttp as 422, { codigo: error.codigo }); throw error; }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      if (!almacenamiento.eliminarArchivo) return responderError(c, "El almacenamiento no permite eliminar archivos", 501, { codigo: "GCS_BORRADO_NO_DISPONIBLE" });
      await almacenamiento.eliminarArchivo(`${configuracion.prefijo}${carpetaUsuario}/${rutaRelativa}`);
      return responderExito(c, { eliminado: rutaRelativa });
    } catch (error) { return responderErrorGcs(c, error); }
  });

  rutas.delete("/carpeta/directorio", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) return responderError(c, "Solo un administrador puede eliminar carpetas", 403, { codigo: "SOLO_ADMIN" });
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs) return responderError(c, "No se pudo resolver la carpeta del usuario", 422, { codigo: "CARPETA_USUARIO_NO_DISPONIBLE" });
    let subruta: string;
    try { subruta = normalizarSubruta(c.req.query("ruta") ?? ""); }
    catch (error) { if (error instanceof ErrorAplicacion) return responderError(c, error.message, error.estadoHttp as 422, { codigo: error.codigo }); throw error; }
    if (!subruta) return responderError(c, "La carpeta privada principal no se puede eliminar", 422, { codigo: "CARPETA_RAIZ_PROTEGIDA" });
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      if (!almacenamiento.eliminarPrefijo) return responderError(c, "El almacenamiento no permite eliminar carpetas", 501, { codigo: "GCS_BORRADO_NO_DISPONIBLE" });
      const eliminados = await almacenamiento.eliminarPrefijo(`${configuracion.prefijo}${carpetaUsuario}/${subruta}`);
      return responderExito(c, { eliminado: subruta, objetosEliminados: eliminados });
    } catch (error) { return responderErrorGcs(c, error); }
  });

  rutas.post("/carpeta/firma", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs) {
      return responderError(
        c,
        "No se pudo resolver la carpeta del usuario",
        422,
        {
          codigo: "CARPETA_USUARIO_NO_DISPONIBLE",
        },
      );
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const cuerpo = await c.req.json<{ ruta?: string }>();
    const rutaRelativa = normalizarRutaArchivo(cuerpo.ruta ?? "");
    const rutaCompleta = `${configuracion.prefijo}${carpetaUsuario}/${rutaRelativa}`;
    if (!esRutaDescargable(rutaCompleta)) {
      return responderError(c, "El archivo solicitado no es descargable", 422, {
        codigo: "RUTA_GCS_NO_PERMITIDA",
      });
    }
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      const url = await almacenamiento.firmar(
        rutaCompleta,
        dependencias.minutosFirma ?? 15,
      );
      return responderExito(c, {
        nombre: rutaCompleta.split("/").at(-1) ?? "archivo",
        url,
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
        "GCS no estÃƒÆ’Ã‚Â¡ configurado para exploraciÃƒÆ’Ã‚Â³n",
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
        "El archivo solicitado estÃƒÆ’Ã‚Â¡ fuera de la ruta permitida",
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

  rutas.get("/administracion/carpetas", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion)) {
      return responderError(c, "Acceso restringido a administradores", 403, {
        codigo: "SOLO_ADMIN",
      });
    }
    if (
      !dependencias.resolverConfiguracionGcs ||
      !dependencias.resolverUsuariosOrganizacion
    ) {
      return responderError(
        c,
        "No se pudo resolver las carpetas de usuarios",
        422,
        {
          codigo: "CARPETAS_USUARIO_NO_CONFIGURADAS",
        },
      );
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    if (!almacenamiento.listarDirectorio) {
      return responderError(
        c,
        "El almacenamiento no permite explorar carpetas",
        501,
        {
          codigo: "GCS_EXPLORADOR_NO_DISPONIBLE",
        },
      );
    }
    try {
      const [directorio, usuarios] = await Promise.all([
        almacenamiento.listarDirectorio(configuracion.prefijo),
        dependencias.resolverUsuariosOrganizacion(sesion.organizacionId),
      ]);
      const existentes = new Set(
        directorio.carpetas.map((carpeta) => carpeta.replace(/\/$/, "")),
      );
      const carpetas = usuarios
        .flatMap((usuario) => {
          if (usuario.id === sesion.usuarioId) return [];
          const carpeta = carpetaDesdeCorreo(usuario.correo);
          if (!carpeta || !existentes.has(carpeta)) return [];
          return [{ usuarioId: usuario.id, correo: usuario.correo, carpeta }];
        })
        .sort((a, b) => a.carpeta.localeCompare(b.carpeta));
      return responderExito(c, carpetas);
    } catch (error) {
      return responderErrorGcs(c, error);
    }
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

function carpetaDesdeCorreo(correo: string | null | undefined): string | null {
  const local = correo
    ?.split("@")[0]
    ?.normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return local || null;
}

function normalizarRutaArchivo(valor: string): string {
  const limpio = valor.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!limpio || limpio.split("/").includes("..")) {
    throw new ErrorAplicacion(
      "RUTA_GCS_NO_PERMITIDA",
      "La ruta solicitada no es vÃƒÆ’Ã‚Â¡lida",
      422,
    );
  }
  return limpio;
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
      "La ruta solicitada no es vÃƒÆ’Ã‚Â¡lida",
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

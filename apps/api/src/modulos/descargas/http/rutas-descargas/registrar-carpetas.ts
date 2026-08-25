import type { Hono } from "hono";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../../nucleo/http/respuestas.js";
import {
  carpetaDesdeCorreo,
  esAdministrador,
  esRutaDescargable,
  normalizarRutaArchivo,
  normalizarSubruta,
  presentarCarpetasEjecucion,
  responderErrorGcs,
} from "./helpers.js";
import type { DependenciasRutasDescargas } from "./tipos.js";

export function registrarRutasCarpeta(
  rutas: Hono,
  dependencias: DependenciasRutasDescargas,
): void {
  rutas.get("/carpeta", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario) {
      return responderError(
        c,
        "La cuenta no tiene un correo vÃƒÆ’Ã‚Â¡lido",
        422,
        {
          codigo: "CORREO_USUARIO_NO_DISPONIBLE",
        },
      );
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
      const ejecuciones = subruta
        ? await dependencias.repositorioReportes.listarEjecucionesDescargas(
            {
              tenantQlikId: sesion.tenantId,
              organizacionId: sesion.organizacionId,
              usuarioId: sesion.usuarioId,
              esAdministrador: false,
            },
            100,
          )
        : [];
      const presentacionCarpetas = presentarCarpetasEjecucion(
        resultado.carpetas,
        ejecuciones,
        subruta,
      );
      return responderExito(c, {
        bucket: configuracion.bucket,
        prefijoBase: prefijoUsuario,
        ruta: subruta,
        carpetaUsuario,
        carpetas: presentacionCarpetas.carpetas,
        carpetasEjecucion: presentacionCarpetas.carpetasEjecucion,
        ejecucionActual: presentacionCarpetas.ejecucionActual,
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
    if (!esAdministrador(sesion))
      return responderError(
        c,
        "Solo un administrador puede eliminar archivos",
        403,
        { codigo: "SOLO_ADMIN" },
      );
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs)
      return responderError(
        c,
        "No se pudo resolver la carpeta del usuario",
        422,
        { codigo: "CARPETA_USUARIO_NO_DISPONIBLE" },
      );
    let rutaRelativa: string;
    try {
      rutaRelativa = normalizarRutaArchivo(c.req.query("ruta") ?? "");
    } catch (error) {
      if (error instanceof ErrorAplicacion)
        return responderError(c, error.message, error.estadoHttp as 422, {
          codigo: error.codigo,
        });
      throw error;
    }
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      if (!almacenamiento.eliminarArchivo)
        return responderError(
          c,
          "El almacenamiento no permite eliminar archivos",
          501,
          { codigo: "GCS_BORRADO_NO_DISPONIBLE" },
        );
      await almacenamiento.eliminarArchivo(
        `${configuracion.prefijo}${carpetaUsuario}/${rutaRelativa}`,
      );
      return responderExito(c, { eliminado: rutaRelativa });
    } catch (error) {
      return responderErrorGcs(c, error);
    }
  });

  rutas.delete("/carpeta/directorio", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!esAdministrador(sesion))
      return responderError(
        c,
        "Solo un administrador puede eliminar carpetas",
        403,
        { codigo: "SOLO_ADMIN" },
      );
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs)
      return responderError(
        c,
        "No se pudo resolver la carpeta del usuario",
        422,
        { codigo: "CARPETA_USUARIO_NO_DISPONIBLE" },
      );
    let subruta: string;
    try {
      subruta = normalizarSubruta(c.req.query("ruta") ?? "");
    } catch (error) {
      if (error instanceof ErrorAplicacion)
        return responderError(c, error.message, error.estadoHttp as 422, {
          codigo: error.codigo,
        });
      throw error;
    }
    if (!subruta)
      return responderError(
        c,
        "La carpeta privada principal no se puede eliminar",
        422,
        { codigo: "CARPETA_RAIZ_PROTEGIDA" },
      );
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    try {
      const almacenamiento = await dependencias.resolverAlmacenamiento(c);
      if (!almacenamiento.eliminarPrefijo)
        return responderError(
          c,
          "El almacenamiento no permite eliminar carpetas",
          501,
          { codigo: "GCS_BORRADO_NO_DISPONIBLE" },
        );
      const eliminados = await almacenamiento.eliminarPrefijo(
        `${configuracion.prefijo}${carpetaUsuario}/${subruta}`,
      );
      return responderExito(c, {
        eliminado: subruta,
        objetosEliminados: eliminados,
      });
    } catch (error) {
      return responderErrorGcs(c, error);
    }
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
}

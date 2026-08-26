import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
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

  rutas.get("/carpeta/zip", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const carpetaUsuario = carpetaDesdeCorreo(sesion.correo);
    if (!carpetaUsuario || !dependencias.resolverConfiguracionGcs)
      return responderError(
        c,
        "No se pudo resolver la carpeta del usuario",
        422,
        {
          codigo: "CARPETA_USUARIO_NO_DISPONIBLE",
        },
      );
    const configuracion = await dependencias.resolverConfiguracionGcs(c);
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    if (!almacenamiento.listarDirectorio || !almacenamiento.abrirLectura)
      return responderError(
        c,
        "El almacenamiento no permite generar ZIP",
        501,
        {
          codigo: "GCS_ZIP_NO_DISPONIBLE",
        },
      );
    try {
      const subruta = normalizarSubruta(c.req.query("ruta") ?? "");
      const directorio = await almacenamiento.listarDirectorio(
        `${configuracion.prefijo}${carpetaUsuario}/${subruta}`,
      );
      if (directorio.archivos.length === 0)
        return responderError(
          c,
          "La carpeta actual no contiene archivos para descargar",
          422,
          {
            codigo: "CARPETA_SIN_ARCHIVOS",
          },
        );
      const zip = new ZipArchive({ store: true });
      for (const archivo of directorio.archivos)
        zip.append(almacenamiento.abrirLectura(archivo.rutaCompleta), {
          name: archivo.nombre,
        });
      void zip.finalize();
      const nombreBase =
        subruta.split("/").filter(Boolean).at(-1) ?? carpetaUsuario;
      return new Response(
        Readable.toWeb(zip as Readable) as unknown as BodyInit,
        {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${nombreBase.replace(/[^a-zA-Z0-9._-]/g, "_") || "descarga"}.zip"`,
            "Cache-Control": "no-store",
          },
        },
      );
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

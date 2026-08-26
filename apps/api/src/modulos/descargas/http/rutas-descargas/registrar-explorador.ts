import type { Hono } from "hono";
import {
  responderError,
  responderExito,
} from "../../../../nucleo/http/respuestas.js";
import {
  carpetaDesdeCorreo,
  esAdministrador,
  esRutaDescargable,
  normalizarSubruta,
  responderErrorGcs,
} from "./helpers.js";
import type { DependenciasRutasDescargas } from "./tipos.js";

export function registrarRutasExplorador(
  rutas: Hono,
  dependencias: DependenciasRutasDescargas,
): void {
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
}

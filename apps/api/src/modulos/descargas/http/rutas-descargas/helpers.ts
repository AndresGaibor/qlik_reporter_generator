import type { Context } from "hono";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import { responderError } from "../../../../nucleo/http/respuestas.js";
import type { PuertoRepositorioReportes } from "../../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { SesionDescarga } from "./tipos.js";

export function presentarCarpetasEjecucion(
  carpetas: string[],
  ejecuciones: Awaited<
    ReturnType<PuertoRepositorioReportes["listarEjecucionesDescargas"]>
  >,
  subruta: string,
) {
  const ejecucionPorId = new Map(ejecuciones.map((item) => [item.id, item]));
  const segmentos = subruta.split("/").filter(Boolean);
  const carpetasDisponibles = [...carpetas];
  if (segmentos.length === 1) {
    for (const ejecucion of ejecuciones) {
      if (!ejecucion.uriBaseGcs.endsWith(`/${subruta}${ejecucion.id}/`))
        continue;
      const carpeta = `${ejecucion.id}/`;
      if (!carpetasDisponibles.includes(carpeta))
        carpetasDisponibles.push(carpeta);
    }
  }
  const metadata = carpetasDisponibles.flatMap((carpeta) => {
    const ejecucionId = carpeta.replace(/\/$/, "");
    const ejecucion = ejecucionPorId.get(ejecucionId);
    if (
      !ejecucion ||
      !ejecucion.uriBaseGcs.endsWith(`/${subruta}${ejecucionId}/`)
    ) {
      return [];
    }
    return [
      {
        carpeta,
        ejecucionId,
        ejecutadoEn: ejecucion.creadoEn.toISOString(),
      },
    ];
  });
  metadata.sort(
    (a, b) => Date.parse(b.ejecutadoEn) - Date.parse(a.ejecutadoEn),
  );
  const metadataPorCarpeta = new Map(
    metadata.map((item) => [item.carpeta, item]),
  );
  const carpetasOrdenadas = [...carpetasDisponibles].sort((a, b) => {
    const actividadA = metadataPorCarpeta.get(a);
    const actividadB = metadataPorCarpeta.get(b);
    if (actividadA && actividadB) {
      return (
        Date.parse(actividadB.ejecutadoEn) - Date.parse(actividadA.ejecutadoEn)
      );
    }
    if (actividadA) return -1;
    if (actividadB) return 1;
    return 0;
  });
  const ejecucionIdActual = segmentos.at(-1);
  const ejecucionActual = ejecucionIdActual
    ? ejecucionPorId.get(ejecucionIdActual)
    : undefined;
  const metadataActual = ejecucionActual?.uriBaseGcs.endsWith(`/${subruta}`)
    ? {
        ejecucionId: ejecucionActual.id,
        ejecutadoEn: ejecucionActual.creadoEn.toISOString(),
      }
    : null;
  return {
    carpetas: carpetasOrdenadas,
    carpetasEjecucion: metadata.map((item, indice) => ({
      ...item,
      esMasReciente: indice === 0,
    })),
    ejecucionActual: metadataActual,
  };
}

export function carpetaDesdeCorreo(
  correo: string | null | undefined,
): string | null {
  const local = correo
    ?.split("@")[0]
    ?.normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return local || null;
}

export function normalizarRutaArchivo(valor: string): string {
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

export function esAdministrador(sesion: SesionDescarga): boolean {
  return Boolean(sesion.esSuperadmin || sesion.roles?.includes("admin"));
}

export function normalizarSubruta(valor: string): string {
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

export function esRutaDescargable(ruta: string): boolean {
  const nombre = ruta.split("/").at(-1) ?? "";
  return (
    !nombre.startsWith("__finalizado__-") &&
    /\.(csv|csv\.gz|parquet)$/i.test(nombre)
  );
}
export function responderErrorGcs(c: Context, error: unknown) {
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

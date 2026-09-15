import type { Context } from "hono";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import { MAXIMO_FILAS_DESCARGA_PREDETERMINADO } from "../../aplicacion/particionar-csv-descarga.js";
import { prefijoPartesNormalizadas } from "../../aplicacion/preparar-partes-normalizadas.js";
import { parsearUriGcsPermitida } from "../../aplicacion/puerto-almacenamiento-descargas.js";
import { esAdministradorEfectivo } from "./helpers.js";
import type { DependenciasRutasDescargas } from "./tipos.js";

export async function prepararDescargaEjecucion(
  c: Context,
  id: string,
  dependencias: DependenciasRutasDescargas,
) {
  const sesion = await dependencias.resolverSesion(c);
  const ejecucion = await dependencias.repositorioReportes.obtenerEjecucionDescarga({
    id,
    tenantQlikId: sesion.tenantId,
    organizacionId: sesion.organizacionId,
    usuarioId: sesion.usuarioId,
    esAdministrador: esAdministradorEfectivo(c, sesion),
  });
  if (!ejecucion)
    throw new ErrorAplicacion(
      "EJECUCION_NO_ENCONTRADA",
      "Descarga no encontrada",
      404,
    );
  if (ejecucion.estado !== "completada")
    throw new ErrorAplicacion(
      "EJECUCION_NO_COMPLETADA",
      "La ejecución aún no está completada",
      409,
    );
  const almacenamiento = await dependencias.resolverAlmacenamiento(c);
  if (!almacenamiento.abrirLectura)
    throw new ErrorAplicacion(
      "GCS_LECTURA_NO_DISPONIBLE",
      "El almacenamiento no permite transmitir archivos",
      501,
    );
  const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
  if (!prefijo.endsWith(`${ejecucion.id}/`))
    throw new ErrorAplicacion(
      "PREFIJO_GCS_INVALIDO",
      "La ruta de resultados no es válida",
      422,
    );
  return { ejecucion, prefijo, almacenamiento };
}

export async function prepararParticionadoEjecucion(
  c: Context,
  id: string,
  dependencias: DependenciasRutasDescargas,
) {
  const base = await prepararDescargaEjecucion(c, id, dependencias);
  const fuentes = (await base.almacenamiento.listar(base.prefijo)).filter(
    (archivo) =>
      /\.csv(?:\.gz)?$/i.test(archivo.nombre) &&
      !archivo.rutaCompleta.startsWith(prefijoPartesNormalizadas(base.prefijo)),
  );
  const configuracion = dependencias.resolverConfiguracionGcs
    ? await dependencias.resolverConfiguracionGcs(c)
    : undefined;
  return {
    ...base,
    fuentes,
    maximoFilas:
      configuracion?.maximoFilasPorArchivo ??
      MAXIMO_FILAS_DESCARGA_PREDETERMINADO,
  };
}

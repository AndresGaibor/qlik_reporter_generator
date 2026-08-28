import { PassThrough, Readable } from "node:stream";
import { esquemaCompartirDescarga } from "@qlik/contratos/descargas";
import { ZipArchive } from "archiver";
import type { Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../../nucleo/http/respuestas.js";
import { SincronizarEjecucionesReporte } from "../../../reportes/aplicacion/sincronizar-ejecuciones-reporte.js";
import { SincronizarJobsBigQueryEjecucion } from "../../../reportes/aplicacion/sincronizar-jobs-bigquery-ejecucion.js";
import {
  MAXIMO_FILAS_DESCARGA_PREDETERMINADO,
  particionarCsvDescarga,
} from "../../aplicacion/particionar-csv-descarga.js";
import {
  iniciarPreparacionPartesNormalizadas,
  listarPartesNormalizadas,
  obtenerPartesNormalizadas,
  prefijoPartesNormalizadas,
} from "../../aplicacion/preparar-partes-normalizadas.js";
import { parsearUriGcsPermitida } from "../../aplicacion/puerto-almacenamiento-descargas.js";
import { ServicioDescargas } from "../../aplicacion/servicio-descargas.js";
import { esAdministrador } from "./helpers.js";
import type { DependenciasRutasDescargas } from "./tipos.js";

export function registrarRutasEjecuciones(
  rutas: Hono,
  dependencias: DependenciasRutasDescargas,
): void {
  const prepararDescarga = async (c: Context, id: string) => {
    const sesion = await dependencias.resolverSesion(c);
    const ejecucion =
      await dependencias.repositorioReportes.obtenerEjecucionDescarga({
        id,
        tenantQlikId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
        usuarioId: sesion.usuarioId,
        esAdministrador: esAdministrador(sesion),
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
  };

  const prepararParticionado = async (c: Context, id: string) => {
    const base = await prepararDescarga(c, id);
    const fuentes = (await base.almacenamiento.listar(base.prefijo)).filter(
      (archivo) =>
        /\.csv(?:\.gz)?$/i.test(archivo.nombre) &&
        !archivo.rutaCompleta.startsWith(
          prefijoPartesNormalizadas(base.prefijo),
        ),
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
  };

  rutas.get("/:id/archivo", async (c) => {
    try {
      const nombre = c.req.query("nombre")?.trim();
      if (!nombre || nombre.includes("/") || nombre.includes("\\"))
        return responderError(c, "Nombre de archivo inválido", 422, {
          codigo: "ARCHIVO_INVALIDO",
        });

      const { almacenamiento, prefijo } = await prepararDescarga(
        c,
        c.req.param("id"),
      );
      const archivo = (await almacenamiento.listar(prefijo)).find(
        (candidato) =>
          candidato.nombre === nombre && esArchivoDescargable(candidato.nombre),
      );
      if (!archivo)
        return responderError(c, "El archivo ya no está disponible", 404, {
          codigo: "ARCHIVO_NO_ENCONTRADO",
        });

      return new Response(
        Readable.toWeb(
          almacenamiento.abrirLectura?.(archivo.rutaCompleta) as Readable,
        ) as unknown as BodyInit,
        {
          headers: {
            "Content-Type": tipoContenidoArchivo(archivo.nombre),
            "Content-Length": String(archivo.tamanoBytes),
            "Content-Disposition": disposicionArchivo(archivo.nombre),
            "Cache-Control": "private, no-store",
          },
        },
      );
    } catch (error) {
      if (error instanceof ErrorAplicacion)
        return responderError(
          c,
          error.message,
          error.estadoHttp as Parameters<typeof responderError>[2],
          { codigo: error.codigo },
        );
      throw error;
    }
  });

  rutas.get("/:id/partes", async (c) => {
    try {
      const { almacenamiento, prefijo, fuentes, maximoFilas } =
        await prepararParticionado(c, c.req.param("id"));
      const estadoPartes = await listarPartesNormalizadas(
        almacenamiento,
        prefijo,
      );
      if (!estadoPartes.completa) {
        iniciarPreparacionPartesNormalizadas(
          almacenamiento,
          prefijo,
          fuentes,
          maximoFilas,
        );
      }
      return responderExito(
        c,
        {
          estado: estadoPartes.completa ? "lista" : "preparando",
          partes: estadoPartes.partes.map((parte, indice) => ({
            numero: indice + 1,
            nombre: parte.nombre,
            tamano: parte.tamanoBytes,
            url: `/api/descargas/${encodeURIComponent(c.req.param("id"))}/partes/${indice + 1}`,
          })),
        },
        estadoPartes.completa ? 200 : 202,
      );
    } catch (error) {
      if (error instanceof ErrorAplicacion)
        return responderError(
          c,
          error.message,
          error.estadoHttp as Parameters<typeof responderError>[2],
          {
            codigo: error.codigo,
          },
        );
      throw error;
    }
  });

  rutas.get("/:id/partes/:numero", async (c) => {
    const numero = Number(c.req.param("numero"));
    if (!Number.isSafeInteger(numero) || numero < 1)
      return responderError(c, "Número de parte inválido", 422);
    try {
      const { almacenamiento, prefijo } = await prepararParticionado(
        c,
        c.req.param("id"),
      );
      const { partes } = await listarPartesNormalizadas(
        almacenamiento,
        prefijo,
      );
      const parte = partes[numero - 1];
      if (!parte)
        return responderError(c, "La parte aÃºn no estÃ¡ disponible", 404);
      return new Response(
        Readable.toWeb(
          almacenamiento.abrirLectura?.(parte.rutaCompleta) as Readable,
        ) as unknown as BodyInit,
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${parte.nombre}"`,
            "Cache-Control": "no-store",
          },
        },
      );
    } catch (error) {
      if (error instanceof ErrorAplicacion)
        return responderError(
          c,
          error.message,
          error.estadoHttp as Parameters<typeof responderError>[2],
          {
            codigo: error.codigo,
          },
        );
      throw error;
    }
  });
  rutas.get("/usuarios-compartibles", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    if (!dependencias.resolverUsuariosOrganizacion)
      return responderError(c, "No se pudo consultar los usuarios", 501);
    const usuarios = await dependencias.resolverUsuariosOrganizacion(
      sesion.organizacionId,
    );
    return responderExito(
      c,
      usuarios
        .filter((usuario) => usuario.id !== sesion.usuarioId)
        .map((usuario) => ({
          ...usuario,
          nombre: usuario.nombre ?? usuario.correo ?? "Usuario",
        })),
    );
  });

  rutas.get("/:id/compartido", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const ejecucion =
      await dependencias.repositorioReportes.obtenerEjecucionPorId(
        c.req.param("id"),
      );
    if (
      !ejecucion ||
      ejecucion.organizacionId !== sesion.organizacionId ||
      ejecucion.tenantQlikId !== sesion.tenantId
    )
      return responderError(c, "Descarga no encontrada", 404);
    if (
      ejecucion.ejecutadoPorUsuarioId !== sesion.usuarioId &&
      !esAdministrador(sesion)
    )
      return responderError(
        c,
        "Solo quien generó la descarga puede compartirla",
        403,
      );
    return responderExito(
      c,
      await dependencias.repositorioReportes.obtenerCompartidoDescarga(
        ejecucion.id,
      ),
    );
  });

  rutas.put("/:id/compartido", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const ejecucion =
      await dependencias.repositorioReportes.obtenerEjecucionPorId(
        c.req.param("id"),
      );
    if (
      !ejecucion ||
      ejecucion.organizacionId !== sesion.organizacionId ||
      ejecucion.tenantQlikId !== sesion.tenantId
    )
      return responderError(c, "Descarga no encontrada", 404);
    if (
      ejecucion.ejecutadoPorUsuarioId !== sesion.usuarioId &&
      !esAdministrador(sesion)
    )
      return responderError(
        c,
        "Solo quien generó la descarga puede compartirla",
        403,
      );
    const entrada = esquemaCompartirDescarga.safeParse(await c.req.json());
    if (!entrada.success)
      return responderError(c, "Datos de compartido inválidos", 422, {
        detalles: entrada.error.flatten(),
      });
    const usuariosOrganizacion = dependencias.resolverUsuariosOrganizacion
      ? await dependencias.resolverUsuariosOrganizacion(sesion.organizacionId)
      : [];
    const permitidos = new Set(
      usuariosOrganizacion.map((usuario) => usuario.id),
    );
    if (entrada.data.usuarios.some((id) => !permitidos.has(id)))
      return responderError(
        c,
        "Uno de los usuarios no pertenece a la organización",
        422,
      );
    await dependencias.repositorioReportes.guardarCompartidoDescarga({
      ejecucionId: ejecucion.id,
      organizacionId: sesion.organizacionId,
      creadoPorUsuarioId: sesion.usuarioId,
      ...entrada.data,
    });
    return responderExito(c, entrada.data);
  });

  rutas.get("/:id/zip", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const ejecucion =
      await dependencias.repositorioReportes.obtenerEjecucionDescarga({
        id: c.req.param("id"),
        tenantQlikId: sesion.tenantId,
        organizacionId: sesion.organizacionId,
        usuarioId: sesion.usuarioId,
        esAdministrador: esAdministrador(sesion),
      });
    if (!ejecucion)
      return responderError(c, "Descarga no encontrada", 404, {
        codigo: "EJECUCION_NO_ENCONTRADA",
      });
    if (ejecucion.estado !== "completada")
      return responderError(c, "La ejecución aún no está completada", 409, {
        codigo: "EJECUCION_NO_COMPLETADA",
      });
    const almacenamiento = await dependencias.resolverAlmacenamiento(c);
    if (!almacenamiento.abrirLectura)
      return responderError(c, "El almacenamiento no permite generar ZIP", 501);
    const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
    if (!prefijo.endsWith(`${ejecucion.id}/`))
      return responderError(c, "La ruta de resultados no es válida", 422);
    const partesNormalizadas = await obtenerPartesNormalizadas(
      almacenamiento,
      prefijo,
    );
    const fuentes = partesNormalizadas
      ? []
      : (await almacenamiento.listar(prefijo)).filter(
          (archivo) =>
            /\.csv(?:\.gz)?$/i.test(archivo.nombre) &&
            !archivo.rutaCompleta.startsWith(
              prefijoPartesNormalizadas(prefijo),
            ),
        );
    if (!partesNormalizadas && !fuentes.length)
      return responderError(c, "La descarga no contiene archivos CSV", 410);
    const configuracion = dependencias.resolverConfiguracionGcs
      ? await dependencias.resolverConfiguracionGcs(c)
      : undefined;
    const zip = new ZipArchive({ store: true });
    if (partesNormalizadas) {
      for (const parte of partesNormalizadas) {
        zip.append(almacenamiento.abrirLectura(parte.rutaCompleta), {
          name: parte.nombre,
        });
      }
      void zip.finalize();
      return new Response(
        Readable.toWeb(zip as Readable) as unknown as BodyInit,
        {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${ejecucion.flujoNombreSnapshot.replace(/[^a-zA-Z0-9._-]/g, "_") || "reporte"}.zip"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    void particionarCsvDescarga(
      almacenamiento,
      fuentes,
      configuracion?.maximoFilasPorArchivo ??
        MAXIMO_FILAS_DESCARGA_PREDETERMINADO,
      (nombre) => {
        const entrada = new PassThrough();
        zip.append(entrada, { name: nombre });
        return entrada;
      },
    )
      .then(() => zip.finalize())
      .catch((error) =>
        zip.destroy(
          error instanceof Error
            ? error
            : new Error("No se pudo generar el ZIP"),
        ),
      );
    return new Response(
      Readable.toWeb(zip as Readable) as unknown as BodyInit,
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${ejecucion.flujoNombreSnapshot.replace(/[^a-zA-Z0-9._-]/g, "_") || "reporte"}.zip"`,
          "Cache-Control": "no-store",
        },
      },
    );
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
      (e) =>
        e.estado === "preparando" ||
        e.estado === "iniciada" ||
        e.estado === "cancelando",
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

      if (dependencias.resolverJobsBigQuery) {
        try {
          const ejecucionFull = await Promise.all(
            flujosDistintos.map((flujoIdQlik) =>
              dependencias.repositorioReportes.listarEjecuciones(
                flujoIdQlik,
                sesion.tenantId,
                sesion.organizacionId,
                100,
              ),
            ),
          );
          const jobsBigQuery = await dependencias.resolverJobsBigQuery(c);
          const sincronizadorBq = new SincronizarJobsBigQueryEjecucion(
            dependencias.repositorioReportes,
            jobsBigQuery,
          );
          await Promise.all(
            ejecucionFull
              .flat()
              .filter(
                (e) =>
                  (e.estado === "preparando" ||
                    e.estado === "iniciada" ||
                    e.estado === "cancelando") &&
                  Boolean(e.jobIdPrincipalBigQuery) &&
                  Boolean(e.bigqueryProjectId),
              )
              .map((e) =>
                sincronizadorBq.sincronizar(e.id).catch(() => undefined),
              ),
          );
        } catch {
          // Un fallo transitorio de BigQuery no debe detener el polling.
        }
      }

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
      const manifiesto = await servicio.crearManifiesto(
        ejecucionId,
        {
          tenantQlikId: sesion.tenantId,
          organizacionId: sesion.organizacionId,
          usuarioId: sesion.usuarioId,
          esAdministrador: esAdministrador(sesion),
        },
        (archivo) =>
          `/api/descargas/${encodeURIComponent(ejecucionId)}/archivo?nombre=${encodeURIComponent(archivo.nombre)}`,
      );

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

function esArchivoDescargable(nombre: string): boolean {
  return (
    /\.(csv|csv\.gz|parquet)$/i.test(nombre) &&
    !nombre.toLowerCase().startsWith("__finalizado__-")
  );
}

function tipoContenidoArchivo(nombre: string): string {
  const normalizado = nombre.toLowerCase();
  if (normalizado.endsWith(".parquet")) return "application/vnd.apache.parquet";
  if (normalizado.endsWith(".gz")) return "application/gzip";
  return "text/csv; charset=utf-8";
}

function disposicionArchivo(nombre: string): string {
  const nombreSeguro = nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachment; filename="${nombreSeguro || "descarga"}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

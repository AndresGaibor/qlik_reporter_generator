import type {
  ContextoDescarga,
  ServicioDescargas as IServicioDescargas,
  ManifiestoDescarga,
  ResumenDescargaEjecucion,
} from "@qlik/contratos/descargas";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import { parsearUriGcsPermitida } from "./puerto-almacenamiento-descargas.js";
import type { PuertoAlmacenamientoDescargas } from "./puerto-almacenamiento-descargas.js";

export class ServicioDescargas implements IServicioDescargas {
  constructor(
    private readonly repositorio: PuertoRepositorioReportes,
    private readonly almacenamiento: PuertoAlmacenamientoDescargas,
    private readonly minutosFirma: number,
  ) {}

  async crearManifiesto(
    ejecucionId: string,
    contexto: ContextoDescarga,
  ): Promise<ManifiestoDescarga> {
    const ejecucion = await this.repositorio.obtenerEjecucionDescarga({
      id: ejecucionId,
      ...contexto,
    });

    if (!ejecucion) {
      throw new ErrorAplicacion(
        "EJECUCION_NO_ENCONTRADA",
        "Ejecución no encontrada",
        404,
      );
    }

    const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
    let estado = ejecucion.estado;
    if (estado === "preparando" || estado === "iniciada") {
      const finalizada = await ejecutarOperacionGcs(
        () => this.almacenamiento.estaFinalizada(prefijo),
        "listar",
      );
      if (finalizada) {
        await this.repositorio.marcarEjecucionCompletada(
          ejecucion.id,
          new Date(),
        );
        estado = "completada";
      }
    }

    if (estado !== "completada") {
      throw new ErrorAplicacion(
        "EJECUCION_NO_COMPLETADA",
        "La ejecución aún no tiene archivos descargables",
        409,
      );
    }

    if (!prefijo.endsWith(`${ejecucion.id}/`)) {
      throw new ErrorAplicacion(
        "PREFIJO_GCS_INVALIDO",
        "La ruta de resultados no es válida",
        422,
      );
    }

    const objetosExportados = (
      await ejecutarOperacionGcs(
        () => this.almacenamiento.listar(prefijo),
        "listar",
      )
    ).filter(esArchivoDescargable);
    if (!objetosExportados.length) {
      throw new ErrorAplicacion(
        "ARCHIVOS_NO_DISPONIBLES",
        "GCS no contiene resultados para esta ejecución",
        410,
      );
    }

    const archivos = objetosExportados
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(async (obj) => ({
        nombre: obj.nombre,
        formato:
          obj.formato ??
          (obj.nombre.toLowerCase().endsWith(".parquet")
            ? "PARQUET"
            : obj.nombre.toLowerCase().endsWith(".csv.gz")
              ? "CSV.GZ"
              : "CSV"),
        tamano: obj.tamanoBytes,
        fecha: obj.fecha ?? null,
        url: await ejecutarOperacionGcs(
          () => this.almacenamiento.firmar(obj.rutaCompleta, this.minutosFirma),
          "firmar",
        ),
      }));

    const resueltos = await Promise.all(archivos);

    return {
      descargaId: ejecucionId,
      archivos: resueltos,
    };
  }

  async listarEjecuciones(
    contexto: ContextoDescarga,
    limite?: number,
  ): Promise<ResumenDescargaEjecucion[]> {
    const ejecuciones = await this.repositorio.listarEjecucionesDescargas(
      contexto,
      limite,
    );

    await Promise.all(
      ejecuciones.map(async (ejecucion) => {
        if (
          ejecucion.estado !== "preparando" &&
          ejecucion.estado !== "iniciada"
        ) {
          return;
        }
        try {
          const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
          if (!prefijo.endsWith(`${ejecucion.id}/`)) return;
          if (
            !(await ejecutarOperacionGcs(
              () => this.almacenamiento.estaFinalizada(prefijo),
              "listar",
            ))
          )
            return;
          const finalizadoEn = new Date();
          await this.repositorio.marcarEjecucionCompletada(
            ejecucion.id,
            finalizadoEn,
          );
          ejecucion.estado = "completada";
          ejecucion.finalizadoEn = finalizadoEn;
        } catch {
          // Una ejecución histórica inválida no debe ocultar el resto de descargas.
        }
      }),
    );

    return Promise.all(
      ejecuciones.map(async (e) => {
        let archivos: Array<{
          nombre: string;
          formato: "CSV" | "CSV.GZ" | "PARQUET";
          tamano: number;
          fecha: string | null;
        }> = [];
        if (e.estado === "completada") {
          const { prefijo } = parsearUriGcsPermitida(e.uriBaseGcs);
          if (prefijo.endsWith(`${e.id}/`)) {
            const objetos = (
              await ejecutarOperacionGcs(
                () => this.almacenamiento.listar(prefijo),
                "listar",
              )
            ).filter(esArchivoDescargable);
            archivos = objetos.map((obj) => ({
              nombre: obj.nombre,
              formato:
                obj.formato ??
                (obj.nombre.toLowerCase().endsWith(".parquet")
                  ? "PARQUET"
                  : obj.nombre.toLowerCase().endsWith(".csv.gz")
                    ? "CSV.GZ"
                    : "CSV"),
              tamano: obj.tamanoBytes,
              fecha: obj.fecha ?? null,
            }));
          }
        }
        return {
          id: e.id,
          flujoIdQlik: e.flujoIdQlik,
          creadoPorUsuarioId: e.creadoPorUsuarioId,
          reporteNombre: e.flujoNombreSnapshot,
          automatizacionIdQlik: e.automatizacionIdQlik,
          estado: e.estado,
          mensajeError: e.mensajeError,
          creadoEn: e.creadoEn.toISOString(),
          finalizadoEn: e.finalizadoEn?.toISOString() ?? null,
          archivos,
        };
      }),
    );
  }
}

function esArchivoDescargable(objeto: { nombre: string }): boolean {
  const nombre = objeto.nombre.toLowerCase();
  return (
    !nombre.startsWith("__finalizado__-") &&
    (nombre.endsWith(".csv") ||
      nombre.endsWith(".csv.gz") ||
      nombre.endsWith(".parquet"))
  );
}

type OperacionGcs = "listar" | "firmar";

async function ejecutarOperacionGcs<T>(
  operacion: () => Promise<T>,
  tipo: OperacionGcs,
): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (error instanceof ErrorAplicacion) throw error;
    const codigo = obtenerCodigoHttp(error);
    if (codigo === 401 || codigo === 403) {
      throw new ErrorAplicacion(
        "GCS_SIN_PERMISOS",
        "La cuenta de servicio de Google Cloud no tiene permisos para acceder a los archivos del reporte",
        502,
      );
    }
    if (tipo === "firmar") {
      throw new ErrorAplicacion(
        "URL_FIRMADA_NO_DISPONIBLE",
        "No se pudo crear la URL temporal de descarga",
        502,
      );
    }
    throw new ErrorAplicacion(
      "GCS_NO_DISPONIBLE",
      "No se pudo consultar Google Cloud Storage",
      502,
    );
  }
}

function obtenerCodigoHttp(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const registro = error as Record<string, unknown>;
  const codigo = registro.code ?? registro.statusCode ?? registro.status;
  return typeof codigo === "number" ? codigo : undefined;
}

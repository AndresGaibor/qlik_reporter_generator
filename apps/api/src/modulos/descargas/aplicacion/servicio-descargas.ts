import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import type {
  ContextoDescarga,
  ManifiestoDescarga,
  ResumenDescargaEjecucion,
  ServicioDescargas as IServicioDescargas,
} from "@qlik/contratos/descargas";
import { parsearUriGcsPermitida } from "./puerto-almacenamiento-descargas.js";
import type { PuertoAlmacenamientoDescargas } from "./puerto-almacenamiento-descargas.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";

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

    if (ejecucion.estado !== "completada") {
      throw new ErrorAplicacion(
        "EJECUCION_NO_COMPLETADA",
        "La ejecución aún no tiene archivos descargables",
        409,
      );
    }

    const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
    if (!prefijo.endsWith(`${ejecucion.id}/`)) {
      throw new ErrorAplicacion(
        "PREFIJO_GCS_INVALIDO",
        "La ruta de resultados no es válida",
        422,
      );
    }

    const objetos = await this.almacenamiento.listar(prefijo);
    if (!objetos.length) {
      throw new ErrorAplicacion(
        "ARCHIVOS_NO_DISPONIBLES",
        "GCS no contiene resultados para esta ejecución",
        410,
      );
    }

    const archivos = objetos
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(async (obj) => ({
        nombre: obj.nombre,
        tamano: obj.tamanoBytes,
        url: await this.almacenamiento.firmar(obj.rutaCompleta, this.minutosFirma),
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

    return ejecuciones.map((e) => ({
      id: e.id,
      reporteNombre: e.reporteNombre,
      automatizacionIdQlik: e.automatizacionIdQlik,
      estado: e.estado,
      mensajeError: e.mensajeError,
      creadoEn: e.creadoEn.toISOString(),
      finalizadoEn: e.finalizadoEn?.toISOString() ?? null,
    }));
  }
}

import type { ArchivoDescarga } from "@qlik/contratos/descargas";

export interface ProgresoDescargaArchivo {
  porcentaje: number;
  archivo: string;
  indice: number;
  total: number;
  bytesDescargados: number;
  totalBytes: number;
}

interface ArchivoEscribible {
  write(datos: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort?(razon?: unknown): Promise<void>;
}

export interface CarpetaDestino {
  getFileHandle(
    nombre: string,
    opciones?: { create?: boolean },
  ): Promise<{ createWritable(): Promise<ArchivoEscribible> }>;
}

function calcularPorcentaje(
  totalBytes: number,
  bytesCompletados: number,
  bytesActuales: number,
): number {
  if (totalBytes <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, ((bytesCompletados + bytesActuales) / totalBytes) * 100),
  );
}

export async function descargarArchivosSecuencialmente(entrada: {
  archivos: ArchivoDescarga[];
  carpeta: CarpetaDestino;
  senal: AbortSignal;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  onProgreso?: (progreso: ProgresoDescargaArchivo) => void;
}) {
  const fetcher =
    entrada.fetcher ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const totalBytes = entrada.archivos.reduce(
    (total, archivo) => total + archivo.tamano,
    0,
  );
  let bytesCompletados = 0;

  for (const [indice, archivo] of entrada.archivos.entries()) {
    if (entrada.senal.aborted) break;
    const respuesta = await fetcher(archivo.url, { signal: entrada.senal });
    if (!respuesta.ok || !respuesta.body) {
      throw new Error(`No se pudo descargar ${archivo.nombre}`);
    }

    const manejador = await entrada.carpeta.getFileHandle(archivo.nombre, {
      create: true,
    });
    const escritor = await manejador.createWritable();
    const lector = respuesta.body.getReader();
    let bytesActuales = 0;
    let ultimaNotificacion = 0;

    try {
      while (true) {
        if (entrada.senal.aborted) {
          throw new DOMException("Descarga cancelada", "AbortError");
        }
        const { done, value } = await lector.read();
        if (done) break;
        await escritor.write(value);
        bytesActuales += value.byteLength;
        const ahora = Date.now();
        if (ahora - ultimaNotificacion >= 250) {
          entrada.onProgreso?.({
            porcentaje: calcularPorcentaje(
              totalBytes,
              bytesCompletados,
              bytesActuales,
            ),
            archivo: archivo.nombre,
            indice: indice + 1,
            total: entrada.archivos.length,
            bytesDescargados: bytesCompletados + bytesActuales,
            totalBytes,
          });
          ultimaNotificacion = ahora;
        }
      }
      await escritor.close();
      bytesCompletados += bytesActuales;
      entrada.onProgreso?.({
        porcentaje: calcularPorcentaje(totalBytes, bytesCompletados, 0),
        archivo: archivo.nombre,
        indice: indice + 1,
        total: entrada.archivos.length,
        bytesDescargados: bytesCompletados,
        totalBytes,
      });
    } catch (error) {
      await escritor.abort?.(error);
      throw error;
    } finally {
      lector.releaseLock();
    }
  }
}

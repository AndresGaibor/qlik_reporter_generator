import type {
  ArchivoDescarga,
  ManifiestoDescarga,
} from "@qlik/contratos/descargas";
import { descargarArchivos } from "./descargador-navegador";

export interface DescargadorSecuencialOpciones {
  senal: AbortSignal;
  onProgreso?: (
    archivoActual: number,
    totalArchivos: number,
    nombreArchivo: string,
  ) => void;
  onArchivoDescargado?: (archivo: ArchivoDescarga) => void;
}

export interface ResultadoDescargaSecuencial {
  exitosas: number;
  fallidas: number;
  archivosProcesados: ArchivoDescarga[];
}

export async function descargarEnSecuencia(
  manifiesto: ManifiestoDescarga,
  opciones: DescargadorSecuencialOpciones,
): Promise<ResultadoDescargaSecuencial> {
  const archivosProcesados: ArchivoDescarga[] = [];
  let exitosas = 0;
  let fallidas = 0;

  for (let i = 0; i < manifiesto.archivos.length; i++) {
    if (opciones.senal.aborted) break;

    const archivo = manifiesto.archivos[i];
    opciones.onProgreso?.(i + 1, manifiesto.archivos.length, archivo.nombre);

    try {
      await descargarArchivos(
        {
          descargaId: manifiesto.descargaId,
          archivos: [archivo],
        },
        { senal: opciones.senal },
      );
      exitosas++;
      archivosProcesados.push(archivo);
      opciones.onArchivoDescargado?.(archivo);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") break;
      fallidas++;
    }
  }

  return { exitosas, fallidas, archivosProcesados };
}

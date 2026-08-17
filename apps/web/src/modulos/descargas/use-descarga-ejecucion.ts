import type { ManifiestoDescarga } from "@qlik/contratos/descargas";
import { useCallback, useRef, useState } from "react";
import { solicitarManifiesto } from "./api";
import { iniciarDescargasNavegador } from "./descargador-navegador";
import {
  type CarpetaDestino,
  descargarArchivosSecuencialmente,
} from "./descargador-secuencial";

export type EstadoDescarga =
  | "idle"
  | "seleccionando_destino"
  | "solicitando_manifiesto"
  | "descargando"
  | "completada"
  | "error";

export interface DescargaEjecucionEstado {
  estado: EstadoDescarga;
  progreso: number;
  porcentaje: number;
  bytesDescargados: number;
  totalBytes: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
}

export interface UseDescargaEjecucionReturn {
  estado: DescargaEjecucionEstado;
  iniciarDescarga: (ejecucionId: string) => Promise<void>;
  cancelar: () => void;
}

interface VentanaConCarpeta extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

function esCancelacion(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useDescargaEjecucion(): UseDescargaEjecucionReturn {
  const controllerRef = useRef<AbortController | null>(null);
  const [estado, establecerEstado] = useState<DescargaEjecucionEstado>({
    estado: "idle",
    progreso: 0,
    porcentaje: 0,
    bytesDescargados: 0,
    totalBytes: 0,
    totalArchivos: 0,
    archivoActual: "",
    error: null,
  });

  const cancelar = useCallback(() => {
    controllerRef.current?.abort();
    establecerEstado((prev) => ({
      ...prev,
      estado: "idle",
      progreso: 0,
      porcentaje: 0,
      bytesDescargados: 0,
      totalBytes: 0,
    }));
  }, []);

  const iniciarDescarga = useCallback(async (ejecucionId: string) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let carpeta: CarpetaDestino | undefined;

    try {
      const selector = (window as VentanaConCarpeta).showDirectoryPicker;
      if (selector) {
        establecerEstado({
          estado: "seleccionando_destino",
          progreso: 0,
          porcentaje: 0,
          bytesDescargados: 0,
          totalBytes: 0,
          totalArchivos: 0,
          archivoActual: "",
          error: null,
        });
        try {
          carpeta = (await selector()) as unknown as CarpetaDestino;
        } catch (error) {
          if (esCancelacion(error)) {
            establecerEstado((prev) => ({ ...prev, estado: "idle" }));
            return;
          }
          throw error;
        }
      }

      establecerEstado({
        estado: "solicitando_manifiesto",
        progreso: 0,
        porcentaje: 0,
        bytesDescargados: 0,
        totalBytes: 0,
        totalArchivos: 0,
        archivoActual: "",
        error: null,
      });

      let manifiesto: ManifiestoDescarga;
      try {
        manifiesto = await solicitarManifiesto(ejecucionId);
      } catch (error) {
        if (esCancelacion(error)) {
          establecerEstado((prev) => ({ ...prev, estado: "idle" }));
          return;
        }
        establecerEstado((prev) => ({
          ...prev,
          estado: "error",
          error:
            error instanceof Error
              ? error.message
              : "Error al obtener manifiesto",
        }));
        return;
      }

      if (controller.signal.aborted) {
        establecerEstado((prev) => ({ ...prev, estado: "idle" }));
        return;
      }

      const totalBytes = manifiesto.archivos.reduce(
        (total, archivo) => total + archivo.tamano,
        0,
      );
      establecerEstado((prev) => ({
        ...prev,
        estado: "descargando",
        totalArchivos: manifiesto.archivos.length,
        totalBytes,
      }));

      if (carpeta) {
        await descargarArchivosSecuencialmente({
          archivos: manifiesto.archivos,
          carpeta,
          senal: controller.signal,
          onProgreso: (progreso) => {
            establecerEstado((prev) => ({
              ...prev,
              progreso: progreso.indice,
              porcentaje: progreso.porcentaje,
              bytesDescargados: progreso.bytesDescargados,
              totalBytes: progreso.totalBytes,
              totalArchivos: progreso.total,
              archivoActual: progreso.archivo,
            }));
          },
        });
      } else {
        await iniciarDescargasNavegador(manifiesto.archivos, {
          senal: controller.signal,
        });
        establecerEstado((prev) => ({
          ...prev,
          progreso: manifiesto.archivos.length,
          porcentaje: 100,
          bytesDescargados: totalBytes,
          totalBytes,
        }));
      }

      if (!controller.signal.aborted) {
        establecerEstado((prev) => ({
          ...prev,
          estado: "completada",
          progreso: manifiesto.archivos.length,
          porcentaje: 100,
          bytesDescargados: totalBytes,
          totalBytes,
        }));
      }
    } catch (error) {
      if (esCancelacion(error)) {
        establecerEstado((prev) => ({ ...prev, estado: "idle" }));
        return;
      }
      establecerEstado((prev) => ({
        ...prev,
        estado: "error",
        error: error instanceof Error ? error.message : "Error en descarga",
      }));
    }
  }, []);

  return { estado, iniciarDescarga, cancelar };
}

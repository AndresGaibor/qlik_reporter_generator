import type { ManifiestoDescarga } from "@qlik/contratos/descargas";
import { useCallback, useRef, useState } from "react";
import { solicitarManifiesto } from "./api";
import { descargarEnSecuencia } from "./descargador-secuencial";

export type EstadoDescarga =
  | "idle"
  | "solicitando_manifiesto"
  | "descargando"
  | "completada"
  | "error";

export interface DescargaEjecucionEstado {
  estado: EstadoDescarga;
  progreso: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
}

export interface UseDescargaEjecucionReturn {
  estado: DescargaEjecucionEstado;
  iniciarDescarga: (ejecucionId: string) => void;
  cancelar: () => void;
}

export function useDescargaEjecucion(): UseDescargaEjecucionReturn {
  const controllerRef = useRef<AbortController | null>(null);
  const [estado, establecerEstado] = useState<DescargaEjecucionEstado>({
    estado: "idle",
    progreso: 0,
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
    }));
  }, []);

  const iniciarDescarga = useCallback(async (ejecucionId: string) => {
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      establecerEstado({
        estado: "solicitando_manifiesto",
        progreso: 0,
        totalArchivos: 0,
        archivoActual: "",
        error: null,
      });

      let manifiesto: ManifiestoDescarga;
      try {
        manifiesto = await solicitarManifiesto(ejecucionId);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
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

      establecerEstado((prev) => ({
        ...prev,
        estado: "descargando",
        totalArchivos: manifiesto.archivos.length,
      }));

      await descargarEnSecuencia(manifiesto, {
        senal: controller.signal,
        onProgreso: (actual, total, nombre) => {
          establecerEstado((prev) => ({
            ...prev,
            progreso: actual,
            totalArchivos: total,
            archivoActual: nombre,
          }));
        },
      });

      if (!controller.signal.aborted) {
        establecerEstado((prev) => ({
          ...prev,
          estado: "completada",
          progreso: manifiesto.archivos.length,
        }));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
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

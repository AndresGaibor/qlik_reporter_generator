import type { ProgramadorReportes } from "./programador-reportes.js";

export interface OpcionesBucleProgramador {
  intervaloMs?: number;
  ejecutarAlIniciar?: boolean;
  setIntervalFn?: (
    callback: () => void,
    intervaloMs: number,
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  onError?: (error: unknown) => void;
}

export function iniciarBucleProgramadorReportes(
  programador: Pick<ProgramadorReportes, "ejecutarPendientes">,
  opciones: OpcionesBucleProgramador = {},
): { detener(): void } {
  const intervaloMs = opciones.intervaloMs ?? 30_000;
  const setIntervalFn = opciones.setIntervalFn ?? setInterval;
  const clearIntervalFn = opciones.clearIntervalFn ?? clearInterval;
  const onError =
    opciones.onError ?? ((error: unknown) => console.error(error));
  let ejecutando = false;

  const ejecutar = () => {
    if (ejecutando) return;
    ejecutando = true;
    void programador
      .ejecutarPendientes()
      .catch(onError)
      .finally(() => {
        ejecutando = false;
      });
  };

  if (opciones.ejecutarAlIniciar ?? true) ejecutar();
  const handle = setIntervalFn(ejecutar, intervaloMs);
  return {
    detener() {
      clearIntervalFn(handle);
    },
  };
}

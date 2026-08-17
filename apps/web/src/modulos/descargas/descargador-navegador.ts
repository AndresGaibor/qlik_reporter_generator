import type { ArchivoDescarga } from "@qlik/contratos/descargas";

interface OpcionesDescargaNavegador {
  pausaMs?: number;
  senal?: AbortSignal;
}

const esperar = (ms: number) =>
  ms > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

export async function iniciarDescargasNavegador(
  archivos: ArchivoDescarga[],
  opciones: OpcionesDescargaNavegador = {},
) {
  const pausaMs = opciones.pausaMs ?? 250;
  for (const [indice, archivo] of archivos.entries()) {
    if (opciones.senal?.aborted) break;
    const enlace = document.createElement("a");
    enlace.href = archivo.url;
    enlace.download = archivo.nombre;
    enlace.rel = "noopener";
    enlace.style.display = "none";
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    if (indice < archivos.length - 1) await esperar(pausaMs);
  }
}

import type { ArchivoDescarga, ManifiestoDescarga } from "@qlik/contratos/descargas";

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

export interface DescargaOpciones {
  senal: AbortSignal;
  onProgreso?: (descargados: number, total: number) => void;
}

export interface ResultadoDescarga {
  exitosas: number;
  fallidas: number;
}

function puedeUsarFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function descargarConFileSystemAccess(
  manifiesto: ManifiestoDescarga,
  opciones: DescargaOpciones,
): Promise<ResultadoDescarga> {
  const showPicker = window.showDirectoryPicker;
  if (!showPicker) throw new Error("File System Access no disponible");
  const dirHandle = await showPicker();
  let exitosas = 0;
  let fallidas = 0;

  for (let i = 0; i < manifiesto.archivos.length; i++) {
    if (opciones.senal.aborted) break;
    const archivo = manifiesto.archivos[i];
    try {
      const respuesta = await fetch(archivo.url, { signal: opciones.senal });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const contenido = await respuesta.blob();
      const fileHandle = await dirHandle.getFileHandle(archivo.nombre, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(contenido);
      await writable.close();
      exitosas++;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") break;
      fallidas++;
    }
    opciones.onProgreso?.(i + 1, manifiesto.archivos.length);
  }

  return { exitosas, fallidas };
}

function crearAnchorTemporal(url: string, nombre: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nombre;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  return anchor;
}

async function descargarConAnchors(
  manifiesto: ManifiestoDescarga,
  opciones: DescargaOpciones,
): Promise<ResultadoDescarga> {
  let exitosas = 0;
  let fallidas = 0;

  for (let i = 0; i < manifiesto.archivos.length; i++) {
    if (opciones.senal.aborted) break;
    const archivo = manifiesto.archivos[i];
    try {
      const anchor = crearAnchorTemporal(archivo.url, archivo.nombre);
      anchor.click();
      document.body.removeChild(anchor);
      exitosas++;
    } catch {
      fallidas++;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    opciones.onProgreso?.(i + 1, manifiesto.archivos.length);
  }

  return { exitosas, fallidas };
}

export async function descargarArchivos(
  manifiesto: ManifiestoDescarga,
  opciones: DescargaOpciones,
): Promise<ResultadoDescarga> {
  if (puedeUsarFileSystemAccess()) {
    return descargarConFileSystemAccess(manifiesto, opciones);
  }
  return descargarConAnchors(manifiesto, opciones);
}

export async function descargarArchivoIndividual(
  archivo: ArchivoDescarga,
  senal: AbortSignal,
): Promise<void> {
  if (puedeUsarFileSystemAccess()) {
    try {
      const respuesta = await fetch(archivo.url, { signal: senal });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const contenido = await respuesta.blob();
      const showPicker = window.showDirectoryPicker;
      if (!showPicker) throw new Error("File System Access no disponible");
      const dirHandle = await showPicker();
      const fileHandle = await dirHandle.getFileHandle(archivo.nombre, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(contenido);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      throw error;
    }
  }

  const anchor = crearAnchorTemporal(archivo.url, archivo.nombre);
  anchor.click();
  document.body.removeChild(anchor);
}

import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ArchivoResumenDescarga } from "@qlik/contratos/descargas";
import { presentarNombreArchivo } from "../modelo-presentacion";
import { formatearTamano } from "../presentacion-ejecucion";

export function ArchivosEjecucion({
  archivos,
  onDescargar,
}: {
  archivos: ArchivoResumenDescarga[];
  onDescargar: (nombre: string) => void;
}) {
  return (
    <div className="grid gap-2" aria-label="Archivos de la ejecución">
      {archivos.map((archivo, posicion) => (
        <div
          key={archivo.nombre}
          className="flex flex-col gap-3 rounded-lg border border-line-200 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Icon
              name="file-text"
              size="md"
              className="shrink-0 text-ink-400"
            />
            <div className="min-w-0">
              <p className="font-medium text-ink-800">
                {presentarNombreArchivo(
                  archivo.nombre,
                  posicion,
                  archivos.length,
                )}
              </p>
              <p className="text-xs text-ink-500">
                {archivo.formato} · {formatearTamano(archivo.tamano)}
              </p>
              <p
                className="truncate text-[11px] text-ink-400"
                title={archivo.nombre}
              >
                Nombre técnico: {archivo.nombre}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDescargar(archivo.nombre)}
            className="w-full shrink-0 sm:w-auto"
          >
            <Icon name="download" size="sm" /> Descargar
          </Button>
        </div>
      ))}
    </div>
  );
}

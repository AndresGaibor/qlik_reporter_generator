import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ReporteDescarga } from "../modelo-presentacion";
import { formatearFechaISO, formatearTamano } from "../presentacion-ejecucion";

export function ListaReportesDescarga({
  reportes,
  onAbrir,
}: {
  reportes: ReporteDescarga[];
  onAbrir: (reporte: ReporteDescarga) => void;
}) {
  return (
    <div className="grid gap-3">
      {reportes.map((reporte) => {
        const ultima = reporte.ultimaEjecucion;
        const tamano = ultima.archivos.reduce(
          (suma, archivo) => suma + archivo.tamano,
          0,
        );
        return (
          <article
            key={reporte.flujoIdQlik}
            className="rounded-xl border border-line-200 bg-surface p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon name="file-text" size="md" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold text-ink-900">
                    {reporte.nombre}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">
                    Última ejecución: {formatearFechaISO(ultima.creadoEn)}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {ultima.archivos.length}{" "}
                    {ultima.archivos.length === 1 ? "archivo" : "archivos"}
                    {ultima.archivos.length > 0
                      ? ` · ${formatearTamano(tamano)}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAbrir(reporte)}
                className="w-full sm:w-auto"
              >
                Ver ejecuciones <Icon name="chev" size="sm" />
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

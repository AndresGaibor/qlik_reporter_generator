import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenReporte } from "@qlik/contratos";

interface Props {
  reportes: ResumenReporte[];
  idEjecutando: string | null;
  onEjecutar: (id: string) => void;
  hayFiltros: boolean;
}

export function ListaReportes({
  reportes,
  idEjecutando,
  onEjecutar,
  hayFiltros,
}: Props) {
  if (reportes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-300 bg-surface p-10 text-center">
        <p className="font-semibold text-ink-700">
          {hayFiltros
            ? "No hay reportes con esos filtros"
            : "Aún no hay reportes"}
        </p>
        <p className="mt-1 text-sm text-ink-400">
          Crea un reporte para verlo aquí.
        </p>
        <Button size="sm" asChild className="mt-4">
          <a href="/reportes">Crear reporte</a>
        </Button>
      </div>
    );
  }
  return (
    <div className="overflow-visible rounded-xl border border-line-200 bg-surface shadow-card">
      <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(250px,0.95fr)_200px_auto] gap-5 border-b border-line-200 bg-app/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 lg:grid">
        <span>Reporte</span>
        <span>Espacio</span>
        <span>Última actualización</span>
        <span className="text-right">Acciones</span>
      </div>
      <div className="divide-y divide-line-200">
        {reportes.map((reporte) => {
          const ejecutando = idEjecutando === reporte.id;
          const detalleUrl = `/reportes/${reporte.id}`;
          return (
            <article
              key={reporte.id}
              className="grid gap-4 px-4 py-4 transition-colors hover:bg-hover/60 sm:px-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.95fr)_200px_auto] lg:items-center lg:gap-5"
            >
              <div className="min-w-0">
                <a
                  href={detalleUrl}
                  title={reporte.nombre}
                  className="block truncate font-display text-base font-semibold text-ink-900 hover:text-brand-700"
                >
                  {reporte.nombre}
                </a>
              </div>
              <p className="truncate text-sm font-medium text-ink-700">
                {reporte.espacioNombre ?? "Personal"}
              </p>
              <span className="text-sm text-ink-600">
                {reporte.modificadoEn
                  ? new Date(reporte.modificadoEn).toLocaleString()
                  : "—"}
              </span>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  size="sm"
                  data-accion="ejecutar"
                  disabled={ejecutando}
                  onClick={() => onEjecutar(reporte.id)}
                  className="gap-1.5 text-xs"
                >
                  <Icon name="play" size="sm" />
                  {ejecutando ? "Iniciando…" : "Ejecutar reporte"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs"
                >
                  <a href={detalleUrl}>
                    <Icon name="file-text" size="sm" />
                    Ver detalle
                  </a>
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

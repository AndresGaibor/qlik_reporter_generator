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
    <div className="overflow-visible rounded-lg border border-line-200 bg-surface">
      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(220px,0.85fr)_230px_240px] gap-5 border-b border-line-200 bg-app/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 lg:grid">
        <span>Reporte</span>
        <span>Espacio</span>
        <span title="Ordenado de más reciente a más antiguo">
          Última actividad <span aria-hidden="true">↓</span>
        </span>
        <span className="text-right">Acciones</span>
      </div>
      <div className="divide-y divide-line-200">
        {reportes.map((reporte) => {
          const ejecutando = idEjecutando === reporte.id;
          const detalleUrl = `/reportes/${reporte.id}`;
          const actividad = obtenerActividadReporte(reporte);
          return (
            <article
              key={reporte.id}
              className="grid gap-4 px-4 py-4 transition-colors hover:bg-hover/60 sm:px-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.85fr)_230px_240px] lg:items-center lg:gap-5"
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
              <div className="min-w-0">
                <span className="block whitespace-nowrap text-sm font-medium text-ink-700">
                  {actividad.fecha
                    ? formatearFechaReporte(actividad.fecha)
                    : "Sin actividad"}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {actividad.etiqueta}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  data-accion="ejecutar"
                  disabled={ejecutando}
                  onClick={() => onEjecutar(reporte.id)}
                  className="gap-1.5 text-xs text-brand-700"
                >
                  <Icon name="play" size="sm" />
                  {ejecutando ? "Iniciando…" : "Ejecutar"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs"
                >
                  <a href={detalleUrl}>
                    <Icon name="file-text" size="sm" />
                    Ver detalles
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

function obtenerActividadReporte(reporte: ResumenReporte) {
  if (reporte.ultimaEjecucionEn) {
    return { fecha: reporte.ultimaEjecucionEn, etiqueta: "Ejecutado" };
  }
  if (reporte.creadoEn) {
    return { fecha: reporte.creadoEn, etiqueta: "Creado" };
  }
  if (reporte.modificadoEn) {
    return { fecha: reporte.modificadoEn, etiqueta: "Actualizado" };
  }
  return { fecha: null, etiqueta: "Sin ejecuciones" };
}

function formatearFechaReporte(valor: string) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(fecha)
    .replace(",", " ·");
}

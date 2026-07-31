import { Icon } from "@/compartido/componentes/ui/icon";
import type { RecursoDestino } from "@/modulos/reportes/api";
import { filtrarRecursos } from "../utiles-resultados";

interface Props {
  recursos: RecursoDestino[];
  seleccionId: string | null;
  busqueda: string;
  onBusquedaChange: (valor: string) => void;
  onSeleccionar: (id: string) => void;
  dataset: string;
}

export function CatalogoResultados({
  recursos,
  seleccionId,
  busqueda,
  onBusquedaChange,
  onSeleccionar,
  dataset,
}: Props) {
  const filtrados = filtrarRecursos(recursos, busqueda);
  const etiquetaCantidad = `${filtrados.length} ${filtrados.length === 1 ? "tabla" : "tablas"}`;

  return (
    <aside className="overflow-hidden rounded-lg border border-line-200 bg-surface shadow-card">
      <div className="border-b border-line-200 bg-app/50 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Dataset activo
            </p>
            <p
              className="mt-1 truncate font-mono text-sm font-semibold text-ink-900"
              title={dataset}
            >
              {dataset}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-obj-50 px-2.5 py-1 text-xs font-semibold text-obj-600">
            {etiquetaCantidad}
          </span>
        </div>
      </div>

      <div className="border-b border-line-200 p-3">
        <label className="relative block">
          <span className="sr-only">Buscar tablas</span>
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => onBusquedaChange(evento.target.value)}
            placeholder="Buscar tabla…"
            className="h-10 w-full rounded-md border border-line-200 bg-surface pl-9 pr-9 text-sm text-ink-900 placeholder:text-ink-400 hover:border-line-300 focus:border-brand-600"
          />
          {busqueda && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => onBusquedaChange("")}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-hover hover:text-ink-700"
            >
              <Icon name="x" size="sm" />
            </button>
          )}
        </label>
      </div>

      <div
        className="max-h-[620px] overflow-y-auto p-2"
        aria-label="Tablas BigQuery"
      >
        {filtrados.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-hover text-ink-400">
              <Icon name={busqueda ? "search" : "db"} />
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-700">
              {busqueda
                ? "No encontramos tablas con esa búsqueda"
                : "Este dataset todavía no tiene tablas"}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {busqueda
                ? "Prueba con otro nombre o limpia el buscador."
                : "Cuando BigQuery tenga tablas o vistas, aparecerán aquí."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtrados.map((recurso) => {
              const seleccionada = seleccionId === recurso.id;
              return (
                <button
                  key={recurso.id}
                  type="button"
                  aria-pressed={seleccionada}
                  onClick={() => onSeleccionar(recurso.id)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                    seleccionada
                      ? "border-brand-100 bg-brand-50 text-brand-700"
                      : "border-transparent text-ink-700 hover:border-line-200 hover:bg-hover"
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                      seleccionada
                        ? "bg-brand-100 text-brand-700"
                        : "bg-app text-ink-500"
                    }`}
                  >
                    <Icon name="db" size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-semibold"
                      title={recurso.nombre}
                    >
                      {recurso.nombre}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-400">
                      {recurso.espacioDeNombres || dataset} · {recurso.tipo}
                    </span>
                  </span>
                  <Icon
                    name="chev"
                    size="sm"
                    className={`rotate-180 ${seleccionada ? "text-brand-600" : "text-ink-300"}`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { SelectBuscable } from "@/compartido/componentes/ui/select-buscable";
import { sufijoBusqueda } from "@/compartido/utiles/automatizaciones";
import type { FormEvent } from "react";

interface Props {
  busquedaTemp: string;
  setBusquedaTemp: (valor: string) => void;
  buscar: (evento: FormEvent) => void;
  limpiar: () => void;
  espacios: { id: string; nombre: string }[];
  errorEspacios?: boolean;
  espacioFiltrado?: string;
  onEspacioChange: (id: string) => void;
  totalResultados: number;
}

export function BarraFiltrosAutomatizaciones({
  busquedaTemp,
  setBusquedaTemp,
  buscar,
  limpiar,
  espacios,
  errorEspacios,
  espacioFiltrado,
  onEspacioChange,
  totalResultados,
}: Props) {
  const busqueda = sufijoBusqueda(espacioFiltrado);

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Crea y ejecuta reportes para consultar la información que necesitas, cuando la necesitas."
        actions={
          <Button asChild>
            <a href={`/reportes/nueva${busqueda}`}>Crear reporte</a>
          </Button>
        }
      />

      <div className="rounded-xl border border-line-200 bg-surface p-3 shadow-card sm:p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <SelectBuscable
            etiqueta="Filtrar por espacio"
            placeholder="Todos los espacios"
            searchPlaceholder="Escribe el nombre del espacio…"
            emptyText="No encontramos ese espacio. Intenta con otro nombre."
            allowClear
            opciones={espacios}
            error={errorEspacios}
            valorSeleccionado={espacioFiltrado ?? ""}
            onSeleccionar={onEspacioChange}
          />

          <form onSubmit={buscar} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="buscar-automatizaciones"
                className="text-sm font-semibold text-ink-700"
              >
                Buscar reportes
              </label>
              <span className="text-xs font-medium text-ink-400">
                {totalResultados}{" "}
                {totalResultados === 1 ? "reporte" : "reportes"}
              </span>
            </div>

            <div className="relative">
              <Icon
                name="search"
                size="sm"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                id="buscar-automatizaciones"
                type="search"
                value={busquedaTemp}
                onChange={(evento) => setBusquedaTemp(evento.target.value)}
                placeholder="Busca por nombre del reporte…"
                className="h-11 w-full rounded-md border border-line-200 bg-surface pl-10 pr-10 text-sm text-ink-900 shadow-card outline-none transition placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
              {busquedaTemp && (
                <button
                  type="button"
                  onClick={limpiar}
                  aria-label="Limpiar búsqueda"
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-400 transition hover:text-ink-700"
                >
                  <Icon name="x" size="sm" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

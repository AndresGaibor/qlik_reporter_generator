import { Icon } from "@/compartido/componentes/ui/icon";
import { useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";

interface Props {
  camposFecha: string[];
  campoFecha: string;
  rango?: DateRange;
  onCampoFecha: (campo: string) => void;
  onRango: (rango: DateRange | undefined) => void;
}

function mostrarFecha(fecha: Date) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(fecha);
}

function rangoUltimosDias(dias: number): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (dias - 1));
  return { from, to };
}

export function SelectorPeriodoReporte({
  camposFecha,
  campoFecha,
  rango,
  onCampoFecha,
  onRango,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const hayCampoFecha = camposFecha.length > 0;

  return (
    <section
      aria-labelledby="titulo-periodo-reporte"
      className="rounded-xl border border-line-200 bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="titulo-periodo-reporte" className="font-semibold text-ink-900">
            2. Periodo del reporte
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Elige la columna que controla el filtro y un rango obligatorio.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          Periodo requerido
        </span>
      </div>

      {!hayCampoFecha ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No encontramos una columna de fecha compatible en esta tabla.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="campo-fecha-reporte" className="block text-xs font-semibold text-ink-700">
              Campo de fecha <span className="text-danger-600">*</span>
            </label>
            <select
              id="campo-fecha-reporte"
              value={campoFecha}
              onChange={(evento) => onCampoFecha(evento.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            >
              {camposFecha.map((campo) => (
                <option key={campo} value={campo}>
                  {campo}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <span className="block text-xs font-semibold text-ink-700">
              Rango de fechas <span className="text-danger-600">*</span>
            </span>
            <button
              type="button"
              aria-expanded={abierto}
              onClick={() => setAbierto((actual) => !actual)}
              className="mt-1 flex h-11 w-full items-center justify-between rounded-md border border-line-200 bg-surface px-3 text-left text-sm text-ink-900 outline-none transition hover:border-line-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            >
              <span className={rango?.from ? "text-ink-900" : "text-ink-400"}>
                {rango?.from
                  ? `${mostrarFecha(rango.from)}${rango.to ? ` – ${mostrarFecha(rango.to)}` : ""}`
                  : "Selecciona un periodo"}
              </span>
              <Icon name="calendar" size="sm" className="text-ink-400" />
            </button>

            {abierto && (
              <div className="absolute right-0 top-full z-30 mt-2 rounded-xl border border-line-200 bg-surface p-3 shadow-panel">
                <DayPicker
                  mode="range"
                  min={1}
                  selected={rango}
                  onSelect={(nuevoRango) => {
                    onRango(nuevoRango);
                    if (nuevoRango?.from && nuevoRango.to) setAbierto(false);
                  }}
                  defaultMonth={rango?.from}
                  showOutsideDays
                  classNames={{
                    root: "text-sm text-ink-900",
                    month_caption: "flex items-center justify-center px-8 pb-2",
                    caption_label: "font-semibold capitalize",
                    nav: "absolute inset-x-3 top-3 flex justify-between",
                    button_previous: "grid h-8 w-8 place-items-center rounded-md hover:bg-hover",
                    button_next: "grid h-8 w-8 place-items-center rounded-md hover:bg-hover",
                    month_grid: "border-separate border-spacing-1",
                    weekday: "text-xs font-medium text-ink-400",
                    day_button: "h-8 w-8 rounded-md hover:bg-hover focus:ring-2 focus:ring-brand-200",
                    selected: "bg-brand-600 text-white hover:bg-brand-700",
                    range_middle: "bg-brand-50 text-brand-900",
                    today: "font-bold text-brand-700",
                    outside: "text-ink-300",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {hayCampoFecha && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-200 pt-4">
          <span className="mr-1 text-xs font-medium text-ink-500">Rangos rápidos:</span>
          {[7, 30, 90].map((dias) => (
            <button
              key={dias}
              type="button"
              onClick={() => onRango(rangoUltimosDias(dias))}
              className="min-h-8 rounded-full bg-app px-3 text-xs font-medium text-ink-700 transition hover:bg-hover"
            >
              Últimos {dias} días
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
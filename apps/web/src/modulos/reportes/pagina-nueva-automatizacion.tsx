import { Button } from "@/compartido/componentes/ui/button";
import { Card, CardContent } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";

interface TablaMaqueta {
  nombre: string;
  columnas: string[];
}

export interface ConfiguracionReporte {
  tabla: string;
  columnas: string[];
  rango?: DateRange;
}

interface Props {
  configuracionInicial?: ConfiguracionReporte;
  onGuardarCambios?: (configuracion: ConfiguracionReporte) => Promise<void>;
  onCancelar?: () => void;
  integrado?: boolean;
}

const TABLAS_MAQUETA: TablaMaqueta[] = [
  {
    nombre: "ventas_diarias",
    columnas: ["id", "telefono", "nombre", "dia", "importe", "region"],
  },
  {
    nombre: "clientes",
    columnas: [
      "id",
      "nombre",
      "email",
      "telefono",
      "fecha_alta",
      ...Array.from(
        { length: 55 },
        (_, indice) => `campo_${String(indice + 1).padStart(2, "0")}`,
      ),
    ],
  },
  {
    nombre: "productos",
    columnas: ["id", "nombre", "categoria", "precio", "stock"],
  },
];

export function PaginaNuevaAutomatizacion({
  configuracionInicial,
  onGuardarCambios,
  onCancelar,
  integrado = false,
}: Props = {}) {
  const tablasDisponibles =
    configuracionInicial?.tabla &&
    !TABLAS_MAQUETA.some((tabla) => tabla.nombre === configuracionInicial.tabla)
      ? [
          ...TABLAS_MAQUETA,
          {
            nombre: configuracionInicial.tabla,
            columnas: configuracionInicial.columnas,
          },
        ]
      : TABLAS_MAQUETA;
  const [tablaSeleccionada, setTablaSeleccionada] = useState(
    configuracionInicial?.tabla ?? TABLAS_MAQUETA[1].nombre,
  );
  const [columnasSeleccionadas, setColumnasSeleccionadas] = useState<string[]>(
    configuracionInicial?.columnas ?? [],
  );
  const [rango, setRango] = useState<DateRange | undefined>(
    configuracionInicial?.rango,
  );
  const [selectorRangoAbierto, setSelectorRangoAbierto] = useState(false);
  const [busquedaColumnas, setBusquedaColumnas] = useState("");
  const [creado, setCreado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const tablaActual =
    tablasDisponibles.find((tabla) => tabla.nombre === tablaSeleccionada) ??
    tablasDisponibles[0];

  function cambiarTabla(nombre: string) {
    setTablaSeleccionada(nombre);
    setColumnasSeleccionadas([]);
    setBusquedaColumnas("");
  }

  function alternarColumna(columna: string) {
    setColumnasSeleccionadas((actuales) =>
      actuales.includes(columna)
        ? actuales.filter((actual) => actual !== columna)
        : [...actuales, columna],
    );
  }

  const columnasVisibles = tablaActual.columnas.filter((columna) =>
    columna.toLowerCase().includes(busquedaColumnas.toLowerCase()),
  );

  function alternarColumnasVisibles() {
    const todasSeleccionadas = columnasVisibles.every((columna) =>
      columnasSeleccionadas.includes(columna),
    );
    setColumnasSeleccionadas((actuales) =>
      todasSeleccionadas
        ? actuales.filter((columna) => !columnasVisibles.includes(columna))
        : Array.from(new Set([...actuales, ...columnasVisibles])),
    );
  }

  function seleccionarRango(nuevoRango: DateRange | undefined) {
    setRango(nuevoRango);
    if (
      nuevoRango?.from &&
      nuevoRango.to &&
      nuevoRango.from.getTime() !== nuevoRango.to.getTime()
    ) {
      setSelectorRangoAbierto(false);
    }
  }

  function mostrarFecha(fecha: Date) {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(fecha);
  }

  async function guardarReporte() {
    const configuracion: ConfiguracionReporte = {
      tabla: tablaSeleccionada,
      columnas: columnasSeleccionadas,
      rango,
    };

    if (onGuardarCambios) {
      setGuardando(true);
      try {
        await onGuardarCambios(configuracion);
        setCreado(true);
      } finally {
        setGuardando(false);
      }
      return;
    }

    setCreado(true);
  }

  return (
    <div
      className={integrado ? "space-y-4" : "mx-auto max-w-5xl space-y-4 pb-4"}
    >
      {!integrado && (
        <Link
          to="/reportes"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <Icon name="chev" size="sm" className="rotate-180" />
          Volver a reportes
        </Link>
      )}

      {!integrado && (
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
            {onGuardarCambios ? "Editar reporte" : "Crear reporte"}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Elige la información, los campos y el periodo que quieres consultar.
          </p>
        </div>
      )}

      <Card
        className={
          integrado
            ? "border-0 bg-surface shadow-none"
            : "border-line-200 bg-surface shadow-card"
        }
      >
        <CardContent
          className={`grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ${integrado ? "rounded-b-xl" : ""}`}
        >
          <div className="space-y-5">
            <section className="space-y-2">
              <label
                htmlFor="tabla-reporte"
                className="block text-sm font-semibold text-ink-900"
              >
                1. Elige la tabla de datos
              </label>
              <select
                id="tabla-reporte"
                value={tablaSeleccionada}
                onChange={(evento) => cambiarTabla(evento.target.value)}
                className="h-11 w-full rounded-md border border-line-200 bg-surface px-3.5 text-sm font-medium text-ink-900 shadow-card outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              >
                {tablasDisponibles.map((tabla) => (
                  <option key={tabla.nombre} value={tabla.nombre}>
                    {tabla.nombre}
                  </option>
                ))}
              </select>
            </section>

            <section className="relative space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  3. Elige el periodo
                </h2>
                <p className="mt-1 text-xs text-ink-500">
                  Indica las fechas que quieres incluir en el reporte.
                </p>
              </div>

              <button
                type="button"
                aria-label="Seleccionar rango de fechas"
                aria-expanded={selectorRangoAbierto}
                onClick={() => setSelectorRangoAbierto((abierto) => !abierto)}
                className={`flex h-11 w-full items-center justify-between rounded-md border bg-surface px-3.5 text-left text-sm shadow-card outline-none transition focus:ring-2 focus:ring-brand-100 ${
                  selectorRangoAbierto
                    ? "border-brand-600 ring-2 ring-brand-100"
                    : "border-line-200 hover:border-line-300"
                }`}
              >
                <span className={rango?.from ? "text-ink-900" : "text-ink-400"}>
                  {rango?.from
                    ? `${mostrarFecha(rango.from)}${rango.to ? ` - ${mostrarFecha(rango.to)}` : ""}`
                    : "Selecciona un rango de fechas"}
                </span>
                <Icon
                  name="chev"
                  size="sm"
                  className="rotate-90 text-ink-400"
                />
              </button>

              {selectorRangoAbierto && (
                <div className="absolute bottom-full left-0 z-20 mb-2 rounded-lg border border-line-200 bg-surface p-3 shadow-panel">
                  <DayPicker
                    mode="range"
                    min={1}
                    resetOnSelect
                    selected={rango}
                    onSelect={seleccionarRango}
                    defaultMonth={rango?.from}
                    showOutsideDays
                    formatters={{
                      formatCaption: (mes) =>
                        new Intl.DateTimeFormat("es-ES", {
                          month: "long",
                          year: "numeric",
                        }).format(mes),
                      formatWeekdayName: (dia) =>
                        new Intl.DateTimeFormat("es-ES", {
                          weekday: "short",
                        }).format(dia),
                    }}
                    classNames={{
                      root: "text-sm text-ink-900",
                      months: "flex",
                      month: "space-y-3",
                      month_caption: "flex items-center justify-center px-8",
                      caption_label: "font-semibold capitalize",
                      nav: "absolute inset-x-3 top-3 flex justify-between",
                      button_previous:
                        "grid h-7 w-7 place-items-center rounded-md text-ink-500 hover:bg-hover hover:text-ink-900",
                      button_next:
                        "grid h-7 w-7 place-items-center rounded-md text-ink-500 hover:bg-hover hover:text-ink-900",
                      month_grid: "w-full border-separate border-spacing-1",
                      weekdays: "text-xs text-ink-400",
                      weekday: "h-7 font-medium uppercase",
                      week: "text-center",
                      day: "h-8 w-8 p-0 text-center",
                      day_button:
                        "h-8 w-8 rounded-md text-sm hover:bg-hover focus:outline-none focus:ring-2 focus:ring-brand-200",
                      selected: "bg-brand-600 text-white hover:bg-brand-700",
                      range_start: "rounded-l-md",
                      range_end: "rounded-r-md",
                      range_middle: "bg-brand-50 text-brand-900",
                      today: "font-bold text-brand-700",
                      outside: "text-ink-300",
                    }}
                  />
                </div>
              )}
            </section>
          </div>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  2. Elige los campos del reporte
                </h2>
                <p className="mt-1 text-xs text-ink-500">
                  Selecciona la información que quieres ver en tu reporte.
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-brand-700">
                {columnasSeleccionadas.length} de {tablaActual.columnas.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Icon
                  name="search"
                  size="sm"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
                />
                <input
                  type="search"
                  value={busquedaColumnas}
                  onChange={(evento) =>
                    setBusquedaColumnas(evento.target.value)
                  }
                  placeholder="Buscar un campo..."
                  aria-label="Buscar campos"
                  className="h-10 w-full rounded-md border border-line-200 bg-surface pl-9 pr-3 text-sm text-ink-900 shadow-card outline-none transition placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                onClick={alternarColumnasVisibles}
                className="h-10 shrink-0 rounded-md border border-line-200 px-3 text-xs font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
              >
                {columnasVisibles.length > 0 &&
                columnasVisibles.every((columna) =>
                  columnasSeleccionadas.includes(columna),
                )
                  ? "Limpiar"
                  : "Todos"}
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border border-line-200 bg-app/30 p-2 pr-1">
              <div className="grid gap-2 pr-1 sm:grid-cols-2">
                {columnasVisibles.map((columna) => {
                  const seleccionada = columnasSeleccionadas.includes(columna);
                  return (
                    <label
                      key={columna}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-sm transition-colors ${
                        seleccionada
                          ? "border-brand-300 bg-brand-50 text-brand-900"
                          : "border-line-200 bg-surface text-ink-700 hover:border-line-300 hover:bg-hover"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={seleccionada}
                        onChange={() => alternarColumna(columna)}
                        className="h-4 w-4 rounded border-line-300 accent-[var(--color-brand-600)]"
                      />
                      <span className="font-medium">{columna}</span>
                    </label>
                  );
                })}
              </div>
              {columnasVisibles.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">
                  No encontramos campos con esa búsqueda.
                </p>
              )}
            </div>
          </section>

          {creado && (
            <p className="rounded-md border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800 lg:col-span-2">
              El reporte está configurado con la información seleccionada.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-line-200 pt-4 lg:col-span-2">
            {onCancelar && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={guardando}
                onClick={onCancelar}
              >
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              className="min-w-44 gap-2"
              disabled={
                guardando ||
                !tablaSeleccionada ||
                columnasSeleccionadas.length === 0 ||
                !rango?.from ||
                !rango.to
              }
              onClick={guardarReporte}
            >
              <Icon name="file-text" size="sm" />
              {guardando
                ? "Guardando cambios..."
                : onGuardarCambios
                  ? "Guardar cambios"
                  : "Crear reporte"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

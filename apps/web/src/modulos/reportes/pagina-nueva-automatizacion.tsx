import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Card, CardContent } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import {
  crearAutomatizacionDesdePlantilla,
  estimarConsultaDestino,
  obtenerConexionesDestino,
  obtenerDetalleRecursoDestino,
  obtenerRecursosDestino,
  obtenerVistaPreviaDestino,
} from "./api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";

interface TablaMaqueta {
  nombre: string;
  columnas: string[];
}

export interface ConfiguracionReporte {
  nombre?: string;
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

export function PaginaNuevaAutomatizacion({
  configuracionInicial,
  onGuardarCambios,
  onCancelar,
  integrado = false,
}: Props = {}) {
  const { data: conexiones = [], isLoading: cargandoConexiones } = useQuery({
    queryKey: ["destinos-conexiones"],
    queryFn: obtenerConexionesDestino,
  });
  const conexionesBigQuery = conexiones.filter(
    (conexion) => conexion.tipo === "bigquery",
  );
  const conexionActiva =
    conexionesBigQuery.find((conexion) => conexion.esPredeterminada) ??
    conexionesBigQuery[0];
  const { data: recursos = [], isLoading: cargandoRecursos } = useQuery({
    queryKey: ["destinos-recursos", conexionActiva?.id],
    queryFn: () => obtenerRecursosDestino(conexionActiva?.id ?? ""),
    enabled: Boolean(conexionActiva),
  });
  const parametros = new URLSearchParams(window.location.search);
  const tablaInicial = configuracionInicial?.tabla ?? parametros.get("tablaId") ?? "";
  const [nombrePersonalizado, setNombrePersonalizado] = useState(
    configuracionInicial?.nombre ?? "",
  );
  const [tablaSeleccionada, setTablaSeleccionada] = useState(tablaInicial);
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

  const { data: detalleTabla } = useQuery({
    queryKey: ["destino-recurso-detalle", conexionActiva?.id, tablaSeleccionada],
    queryFn: () => obtenerDetalleRecursoDestino(conexionActiva?.id ?? "", tablaSeleccionada),
    enabled: Boolean(conexionActiva && tablaSeleccionada),
  });

  const { data: previewFilas = [], isLoading: cargandoPreview } = useQuery({
    queryKey: ["destino-recurso-preview", conexionActiva?.id, tablaSeleccionada],
    queryFn: () => obtenerVistaPreviaDestino(conexionActiva!.id, tablaSeleccionada, 10),
    enabled: Boolean(conexionActiva?.id && tablaSeleccionada),
  });

  const fechaDesdeStr = formatearFechaLocal(rango?.from);
  const fechaHastaStr = formatearFechaLocal(rango?.to);

  const { data: estimacionCosto, isLoading: cargandoEstimacion } = useQuery({
    queryKey: [
      "destino-recurso-estimacion",
      conexionActiva?.id,
      tablaSeleccionada,
      columnasSeleccionadas.join(","),
      fechaDesdeStr,
      fechaHastaStr,
    ],
    queryFn: () =>
      estimarConsultaDestino(conexionActiva!.id, {
        recursoId: tablaSeleccionada,
        columnas: columnasSeleccionadas,
        fechaDesde: fechaDesdeStr,
        fechaHasta: fechaHastaStr,
      }),
    enabled:
      Boolean(conexionActiva?.id) &&
      Boolean(tablaSeleccionada) &&
      columnasSeleccionadas.length > 0,
  });

  const listaColumnas =
    detalleTabla?.columnas && detalleTabla.columnas.length > 0
      ? detalleTabla.columnas
      : previewFilas[0]
        ? Object.keys(previewFilas[0]).map((nombre) => ({
            nombre,
            tipo: "STRING",
          }))
        : [];

  const columnasDeTabla = listaColumnas.map((columna) => columna.nombre);

  const objetosColumnasVisibles = listaColumnas.filter((columna) =>
    columna.nombre.toLowerCase().includes(busquedaColumnas.toLowerCase()),
  );

  const [tablaInicializada, setTablaInicializada] = useState<string | null>(null);

  useEffect(() => {
    if (!tablaSeleccionada && recursos[0]) setTablaSeleccionada(recursos[0].nombre);
  }, [recursos, tablaSeleccionada]);

  useEffect(() => {
    if (
      tablaSeleccionada &&
      columnasDeTabla.length > 0 &&
      tablaInicializada !== tablaSeleccionada
    ) {
      setTablaInicializada(tablaSeleccionada);
      if (columnasSeleccionadas.length === 0) {
        setColumnasSeleccionadas(columnasDeTabla);
      }
    }
  }, [tablaSeleccionada, columnasDeTabla, tablaInicializada, columnasSeleccionadas.length]);

  function cambiarTabla(nombre: string) {
    setTablaSeleccionada(nombre);
    setTablaInicializada(null);
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

  function alternarColumnasVisibles(evento?: React.MouseEvent) {
    if (evento) {
      evento.preventDefault();
      evento.stopPropagation();
    }
    const nombresVisibles = objetosColumnasVisibles.map((c) => c.nombre);
    const todasSeleccionadas =
      nombresVisibles.length > 0 &&
      nombresVisibles.every((col) => columnasSeleccionadas.includes(col));
    setColumnasSeleccionadas((actuales) =>
      todasSeleccionadas
        ? actuales.filter((col) => !nombresVisibles.includes(col))
        : Array.from(new Set([...actuales, ...nombresVisibles])),
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

  const { mostrarExito, mostrarError } = useNotificaciones();
  const { data: sesionInfo } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    staleTime: 5 * 60 * 1000,
  });

  const autor =
    sesionInfo?.usuario?.nombre ||
    sesionInfo?.identidad?.nombreQlik ||
    sesionInfo?.usuario?.correo ||
    "";
  const nombreSugerido = `Reporte ${tablaSeleccionada}${autor ? ` ${autor}` : ""}`;
  const nombreFinal = nombrePersonalizado.trim() || nombreSugerido;

  async function guardarReporte() {
    const configuracion: ConfiguracionReporte = {
      nombre: nombreFinal,
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

    setGuardando(true);
    try {
      const fDesde = formatearFechaLocal(rango?.from);
      const fHasta = formatearFechaLocal(rango?.to);
      const resultado = await crearAutomatizacionDesdePlantilla({
        nombre: nombreFinal,
        tablaId: tablaSeleccionada,
        autor,
        fechaDesde: fDesde,
        fechaHasta: fHasta,
        columnas: columnasSeleccionadas,
        formatoSalida: "CSV",
        espacioIdQlik: parametros.get("espacioId") || undefined,
        reemplazosWorkspace: [],
      });
      mostrarExito("Reporte creado y configurado con éxito");
      if (resultado?.id) {
        window.location.href = `/reportes/${resultado.id}`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear el reporte";
      mostrarError(msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className={integrado ? "space-y-4" : "mx-auto max-w-5xl space-y-4 pb-4"}
    >
      {cargandoConexiones || cargandoRecursos ? (
        <p className="rounded-lg border border-line-200 bg-surface p-4 text-sm text-ink-500">Cargando tablas de BigQuery…</p>
      ) : !conexionActiva ? (
        <p className="rounded-lg border border-line-200 bg-surface p-4 text-sm text-ink-500">No hay una conexión BigQuery predeterminada configurada.</p>
      ) : null}

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
          className={`space-y-6 p-5 sm:p-6 ${integrado ? "rounded-b-xl" : ""}`}
        >
          {/* Nombre del reporte */}
          <section className="space-y-2">
            <label
              htmlFor="nombre-reporte"
              className="block text-sm font-semibold text-ink-900"
            >
              Nombre del reporte
            </label>
            <input
              id="nombre-reporte"
              type="text"
              value={nombrePersonalizado}
              onChange={(evento) => setNombrePersonalizado(evento.target.value)}
              placeholder={nombreSugerido}
              className="h-11 w-full rounded-md border border-line-200 bg-surface px-3.5 text-sm font-medium text-ink-900 shadow-card outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 placeholder:text-ink-300"
            />
          </section>

          {/* Fila superior: 1. Tabla y 2. Periodo */}
          <div className="grid gap-5 sm:grid-cols-2">
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
                {recursos.map((recurso) => (
                  <option key={recurso.nombre} value={recurso.nombre}>
                    {recurso.nombre}
                  </option>
                ))}
              </select>
            </section>

            <section className="relative space-y-2">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  2. Elige el periodo
                </h2>
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
                <div className="absolute top-full left-0 z-20 mt-1 rounded-lg border border-line-200 bg-surface p-3 shadow-panel">
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

          {/* Sección de Vista Previa de Datos y Selección de Columnas */}
          <section className="space-y-3 pt-2 border-t border-line-200">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  <Icon name="grid" size="sm" className="text-brand-600" />
                  3. Vista previa de datos y selección de campos
                </h2>
                <p className="mt-1 text-xs text-ink-500">
                  Haz clic en el checkbox de la cabecera para incluir o descartar cada columna del reporte final.
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                {columnasSeleccionadas.length} de {columnasDeTabla.length} campos seleccionados
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
                  placeholder="Filtrar columnas de la vista previa..."
                  aria-label="Buscar campos"
                  className="h-10 w-full rounded-md border border-line-200 bg-surface pl-9 pr-3 text-sm text-ink-900 shadow-card outline-none transition placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                onClick={alternarColumnasVisibles}
                className="h-10 shrink-0 rounded-md border border-line-200 px-3.5 text-xs font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
              >
                {objetosColumnasVisibles.length > 0 &&
                objetosColumnasVisibles.every((col) =>
                  columnasSeleccionadas.includes(col.nombre),
                )
                  ? "Deseleccionar visibles"
                  : "Seleccionar visibles"}
              </button>
            </div>

            {/* Tabla con registros de Vista Previa y Checkbox en cada Cabecera */}
            <div className="rounded-lg border border-line-200 bg-surface shadow-inner overflow-hidden">
              <div className="max-h-[360px] overflow-auto">
                {cargandoPreview ? (
                  <div className="p-8 text-center text-xs text-ink-500">
                    Cargando datos de vista previa desde BigQuery…
                  </div>
                ) : objetosColumnasVisibles.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-400">
                    No encontramos campos con esa búsqueda.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-sm text-ink-900 font-semibold border-b border-line-200 z-10">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center border-r border-line-200 bg-slate-200/60">
                          #
                        </th>
                        {objetosColumnasVisibles.map((col) => {
                          const seleccionada = columnasSeleccionadas.includes(col.nombre);
                          return (
                            <th
                              key={col.nombre}
                              onClick={() => alternarColumna(col.nombre)}
                              className={`px-3.5 py-2.5 whitespace-nowrap border-r border-line-200 cursor-pointer select-none transition-colors ${
                                seleccionada
                                  ? "bg-brand-50/90 text-brand-950"
                                  : "bg-slate-100/80 text-ink-400"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={seleccionada}
                                  onChange={() => alternarColumna(col.nombre)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 rounded border-line-300 accent-[var(--color-brand-600)] cursor-pointer shrink-0"
                                />
                                <div>
                                  <div className={`font-mono text-xs ${seleccionada ? "font-bold text-ink-900" : "font-medium text-slate-400 line-through"}`}>
                                    {col.nombre}
                                  </div>
                                  <div className="text-[10px] font-sans font-normal text-ink-400">
                                    {col.tipo || "STRING"}
                                  </div>
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-100">
                      {previewFilas.length === 0 ? (
                        <tr>
                          <td
                            colSpan={objetosColumnasVisibles.length + 1}
                            className="p-6 text-center text-xs text-ink-400"
                          >
                            No hay registros para mostrar en esta vista previa.
                          </td>
                        </tr>
                      ) : (
                        previewFilas.map((fila, i) => (
                          <tr key={i} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 text-center text-ink-400 font-mono text-[11px] border-r border-line-100 bg-slate-50/50">
                              {i + 1}
                            </td>
                            {objetosColumnasVisibles.map((col) => {
                              const seleccionada = columnasSeleccionadas.includes(col.nombre);
                              const val = fila[col.nombre];
                              return (
                                <td
                                  key={col.nombre}
                                  className={`px-3.5 py-2 whitespace-nowrap border-r border-line-100 max-w-[240px] truncate transition-opacity ${
                                    seleccionada
                                      ? "bg-white font-medium text-slate-800"
                                      : "bg-slate-50/60 opacity-35 italic text-slate-400"
                                  }`}
                                >
                                  {val === null || val === undefined ? (
                                    <span className="text-slate-400 italic">null</span>
                                  ) : (
                                    formatearValorCelda(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          {creado && (
            <p className="rounded-md border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800 lg:col-span-2">
              El reporte está configurado con la información seleccionada.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-200 pt-4">
            {/* Costo estimado del reporte directamente al lado de la acción */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-900 text-slate-100 px-4 py-2.5 rounded-xl border border-slate-800 shadow-sm text-xs font-mono">
              <div className="flex items-center gap-2 font-sans font-semibold text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Costo estimado:
              </div>
              {cargandoEstimacion ? (
                <span className="text-slate-400 animate-pulse">Calculando…</span>
              ) : estimacionCosto ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-emerald-400 text-sm">
                    ${estimacionCosto.costoEstimadoUsd.toFixed(8)} USD
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    (~{(estimacionCosto.bytesProcesados / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>

            {/* Acciones del formulario */}
            <div className="flex items-center gap-3 shrink-0">
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
                className="min-w-44 gap-2 bg-brand-600 hover:bg-brand-700 text-white"
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatearValorCelda(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "object" && val !== null) {
    if ("value" in val && val.value !== undefined && val.value !== null) {
      return String(val.value);
    }
    if (val instanceof Date) {
      return val.toISOString().split("T")[0] ?? String(val);
    }
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function formatearFechaLocal(fecha?: Date): string | undefined {
  if (!fecha) return undefined;
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

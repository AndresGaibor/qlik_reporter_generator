import { Icon } from "@/compartido/componentes/ui/icon";
import { useMemo, useState } from "react";
import {
  type CampoReporte,
  esCampoFecha,
  esCampoNumerico,
} from "../utiles-creador-reporte";

type FiltroCampo = "todos" | "seleccionados" | "fechas" | "texto" | "numeros";

interface Props {
  campos: CampoReporte[];
  seleccionados: string[];
  busqueda: string;
  onBusqueda: (valor: string) => void;
  onAlternar: (nombre: string) => void;
  onSeleccionarVisibles: (nombres: string[], seleccionar: boolean) => void;
}

const filtros: Array<{ id: FiltroCampo; etiqueta: string }> = [
  { id: "todos", etiqueta: "Todos" },
  { id: "seleccionados", etiqueta: "Seleccionados" },
  { id: "fechas", etiqueta: "Fechas" },
  { id: "texto", etiqueta: "Texto" },
  { id: "numeros", etiqueta: "Números" },
];

function coincideFiltro(campo: CampoReporte, filtro: FiltroCampo, seleccionados: string[]) {
  if (filtro === "seleccionados") return seleccionados.includes(campo.nombre);
  if (filtro === "fechas") return esCampoFecha(campo);
  if (filtro === "numeros") return esCampoNumerico(campo);
  if (filtro === "texto") return !esCampoFecha(campo) && !esCampoNumerico(campo);
  return true;
}
export function SelectorCamposReporte({
  campos,
  seleccionados,
  busqueda,
  onBusqueda,
  onAlternar,
  onSeleccionarVisibles,
}: Props) {
  const [filtro, setFiltro] = useState<FiltroCampo>("todos");
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return campos.filter(
      (campo) =>
        coincideFiltro(campo, filtro, seleccionados) &&
        (!termino ||
          campo.nombre.toLowerCase().includes(termino) ||
          campo.tipo.toLowerCase().includes(termino)),
    );
  }, [busqueda, campos, filtro, seleccionados]);
  const nombresVisibles = visibles.map((campo) => campo.nombre);
  const todosVisiblesSeleccionados =
    nombresVisibles.length > 0 &&
    nombresVisibles.every((nombre) => seleccionados.includes(nombre));

  return (
    <section
      aria-labelledby="titulo-campos-reporte"
      className="overflow-hidden rounded-xl border border-line-200 bg-surface"
    >
      <div className="border-b border-line-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="titulo-campos-reporte" className="font-semibold text-ink-900">
              Campos del reporte
            </h3>
            <p aria-live="polite" className="mt-1 text-xs text-ink-500">
              {seleccionados.length} de {campos.length} campos seleccionados
            </p>
          </div>
          <button
            type="button"
            disabled={nombresVisibles.length === 0}
            onClick={() =>
              onSeleccionarVisibles(nombresVisibles, !todosVisiblesSeleccionados)
            }
            className="min-h-9 rounded-md border border-line-200 px-3 text-xs font-semibold text-ink-700 transition hover:bg-hover disabled:opacity-50"
          >
            {todosVisiblesSeleccionados
              ? "Deseleccionar visibles"
              : "Seleccionar visibles"}
          </button>
        </div>

        <div className="relative mt-4">
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => onBusqueda(evento.target.value)}
            placeholder="Buscar por nombre o tipo…"
            aria-label="Buscar campos del reporte"
            className="h-10 w-full rounded-md border border-line-200 bg-surface pl-9 pr-3 text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtrar campos">
          {filtros.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              aria-pressed={filtro === opcion.id}
              onClick={() => setFiltro(opcion.id)}
              className={`min-h-8 rounded-full px-3 text-xs font-medium transition ${
                filtro === opcion.id
                  ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200"
                  : "bg-app text-ink-600 hover:bg-hover"
              }`}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {visibles.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-500">
            No encontramos campos con esos filtros.
          </p>
        ) : (
          <ul className="space-y-1">
            {visibles.map((campo) => {
              const seleccionado = seleccionados.includes(campo.nombre);
              return (
                <li key={campo.nombre}>
                  <label
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition ${
                      seleccionado ? "bg-brand-50/70" : "hover:bg-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      onChange={() => onAlternar(campo.nombre)}
                      aria-label={`Incluir ${campo.nombre}`}
                      className="h-4 w-4 shrink-0 rounded border-line-300 accent-[var(--color-brand-600)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {campo.nombre}
                      </span>
                      <span className="block text-[11px] uppercase tracking-wide text-ink-400">
                        {campo.tipo || "STRING"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
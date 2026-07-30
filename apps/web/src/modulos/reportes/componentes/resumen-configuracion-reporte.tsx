import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import {
  type ConfiguracionReporte,
  PaginaNuevaAutomatizacion,
} from "@/modulos/reportes/pagina-nueva-automatizacion";
import { useState } from "react";

interface Props {
  configuracion: ConfiguracionReporte;
  onGuardarCambios: (configuracion: ConfiguracionReporte) => Promise<void>;
}

function formatearFecha(fecha?: Date) {
  if (!fecha) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(fecha)
    .replace(" de ", " ")
    .replace(" de ", " ");
}

function periodo(configuracion: ConfiguracionReporte) {
  const desde = configuracion.rango?.from;
  const hasta = configuracion.rango?.to;
  if (!desde && !hasta) return "Sin periodo definido";
  if (desde && hasta) {
    return `${formatearFecha(desde)} – ${formatearFecha(hasta)}`;
  }
  return formatearFecha(desde ?? hasta);
}

export function ResumenConfiguracionReporte({
  configuracion,
  onGuardarCambios,
}: Props) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <section className="rounded-xl border border-line-200 bg-surface shadow-card">
        <div className="border-b border-line-200 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            Configuración del reporte
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Editar información y periodo
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Los cambios se aplicarán en la siguiente ejecución.
          </p>
        </div>
        <PaginaNuevaAutomatizacion
          configuracionInicial={configuracion}
          integrado
          onCancelar={() => setEditando(false)}
          onGuardarCambios={async (nuevaConfiguracion) => {
            await onGuardarCambios(nuevaConfiguracion);
            setEditando(false);
          }}
        />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line-200 bg-surface px-5 py-5 shadow-card sm:px-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
            Configuración del reporte
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Datos que se incluirán
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Revisa el origen, los campos y el periodo antes de ejecutar.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditando(true)}
          className="shrink-0 gap-2"
        >
          <Icon name="edit" size="sm" />
          Editar configuración
        </Button>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-line-200 pt-5 sm:grid-cols-3">
        <div className="rounded-lg bg-app px-4 py-3">
          <dt className="text-xs font-medium text-ink-400">Tabla de datos</dt>
          <dd className="mt-1 truncate font-mono text-sm font-semibold text-ink-900">
            {configuracion.tabla}
          </dd>
        </div>
        <div className="rounded-lg bg-app px-4 py-3">
          <dt className="text-xs font-medium text-ink-400">Campos incluidos</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">
            {configuracion.columnas.length}{" "}
            {configuracion.columnas.length === 1 ? "campo" : "campos"}
          </dd>
        </div>
        <div className="rounded-lg bg-app px-4 py-3">
          <dt className="text-xs font-medium text-ink-400">Periodo</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">
            {periodo(configuracion)}
          </dd>
        </div>
      </dl>

      {configuracion.columnas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {configuracion.columnas.slice(0, 6).map((columna) => (
            <span
              key={columna}
              className="rounded-full border border-line-200 bg-surface px-2.5 py-1 font-mono text-xs text-ink-600"
            >
              {columna}
            </span>
          ))}
          {configuracion.columnas.length > 6 && (
            <span className="rounded-full bg-app px-2.5 py-1 text-xs font-semibold text-ink-500">
              +{configuracion.columnas.length - 6} más
            </span>
          )}
        </div>
      )}
    </section>
  );
}

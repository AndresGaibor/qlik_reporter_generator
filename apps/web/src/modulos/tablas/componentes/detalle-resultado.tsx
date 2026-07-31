import { Button } from "@/compartido/componentes/ui/button";
import { Card } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type {
  DetalleResultadoBigQuery,
  PestanaResultado,
} from "../tipos-resultados";
import { formatearFechaResultado } from "../utiles-resultados";
import { TablaEsquema } from "./tabla-esquema";
import { TablaPreview } from "./tabla-preview";

interface Props {
  detalle: DetalleResultadoBigQuery;
  pestana: PestanaResultado;
  onPestanaChange: (pestana: PestanaResultado) => void;
  filasPreview: Array<Record<string, unknown>>;
  cargandoPreview: boolean;
  errorPreview?: string;
  onReintentarPreview?: () => void;
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0 border-l-2 border-line-200 pl-3">
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-400">
        {etiqueta}
      </span>
      <span className="mt-1 block truncate text-sm font-semibold text-ink-900" title={valor}>
        {valor}
      </span>
    </div>
  );
}

export function DetalleResultado({
  detalle,
  pestana,
  onPestanaChange,
  filasPreview,
  cargandoPreview,
  errorPreview,
  onReintentarPreview,
}: Props) {
  const columnas = detalle.columnas ?? [];
  const nombreCompleto = detalle.espacioDeNombres
    ? `${detalle.espacioDeNombres}.${detalle.nombre}`
    : detalle.nombre;
  const hrefCrear = `/reportes/nueva?flujoId=&tablaId=${encodeURIComponent(detalle.id)}`;

  return (
    <Card className="overflow-hidden border-line-200 bg-surface shadow-card">
      <header className="border-b border-line-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name="db" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-obj-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-obj-600">
                  BigQuery · {detalle.tipo}
                </span>
              </div>
              <h2 className="mt-2 break-all font-mono text-lg font-semibold text-ink-900">
                {nombreCompleto}
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Consulta el esquema y una muestra antes de crear un reporte.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <a href={hrefCrear}>
              <Icon name="plus" size="sm" />
              Crear reporte con esta tabla
            </a>
          </Button>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line-200 pt-4 sm:grid-cols-3">
          <Metrica
            etiqueta="Registros"
            valor={
              detalle.totalFilas === undefined
                ? "No disponible"
                : new Intl.NumberFormat("es-EC").format(detalle.totalFilas)
            }
          />
          <Metrica etiqueta="Campos" valor={`${columnas.length} campos`} />
          <Metrica
            etiqueta="Actualización"
            valor={formatearFechaResultado(detalle.actualizadoEn)}
          />
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-line-200 bg-app/50 px-3 pt-2 sm:px-5" role="tablist" aria-label="Contenido de la tabla">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "campos"}
          onClick={() => onPestanaChange("campos")}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${
            pestana === "campos"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          <Icon name="grid" size="sm" />
          Campos ({columnas.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "preview"}
          onClick={() => onPestanaChange("preview")}
          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${
            pestana === "preview"
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          <Icon name="rows" size="sm" />
          Vista previa
        </button>
      </div>

      <div role="tabpanel" aria-live="polite">
        {pestana === "campos" ? (
          <TablaEsquema columnas={columnas} />
        ) : (
          <TablaPreview
            filas={filasPreview}
            cargando={cargandoPreview}
            error={errorPreview}
            onReintentar={onReintentarPreview}
          />
        )}
      </div>
    </Card>
  );
}

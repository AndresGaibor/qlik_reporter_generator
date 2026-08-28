import { Button } from "@/compartido/componentes/ui/button";
import type { DetalleEjecucionReporte } from "@qlik/contratos";

export function EstadoEjecucionEnVivo({
  ejecucion,
  cancelando,
  onCancelar,
}: {
  ejecucion: DetalleEjecucionReporte;
  cancelando: boolean;
  onCancelar: () => void;
}) {
  const progreso = ejecucion.progreso;
  return (
    <section
      className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5"
      aria-live="polite"
    >
      <span className="inline-flex rounded-full border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800">
        {cancelando || ejecucion.estado === "cancelando"
          ? "Cancelando…"
          : "En proceso"}
      </span>
      <h2 className="text-lg font-semibold text-ink-900">
        {cancelando || ejecucion.estado === "cancelando"
          ? "Cancelando ejecución"
          : "Reporte en proceso"}
      </h2>
      <p className="text-sm text-ink-700">
        {progreso?.mensaje ?? "Preparando el reporte"}
      </p>
      <p className="text-sm text-ink-600">
        El reporte continúa procesándose. Puedes salir de esta pantalla y volver
        más tarde.
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-amber-200">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-600" />
      </div>
      {progreso?.tardaMasDeLoHabitual && (
        <p className="text-sm text-amber-900">
          Este reporte está tardando más de lo habitual, pero continúa
          procesándose.
        </p>
      )}
      {progreso?.altaDemanda && (
        <p className="text-sm text-amber-900">
          El servicio está procesando el reporte más lentamente de lo habitual
          por alta demanda.
        </p>
      )}
      {progreso?.volumenInusual && (
        <p className="text-sm text-amber-900">
          Este reporte está generando una cantidad de información mayor de la
          esperada. Puede tardar considerablemente más.
        </p>
      )}
      {cancelando || ejecucion.estado === "cancelando" ? (
        <p className="text-sm text-ink-700">
          Estamos solicitando detener el procesamiento.
        </p>
      ) : (
        <Button size="sm" variant="outline" onClick={onCancelar}>
          Cancelar ejecución
        </Button>
      )}
    </section>
  );
}

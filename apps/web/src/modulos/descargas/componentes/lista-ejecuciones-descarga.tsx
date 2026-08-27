import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { presentarEjecucionDescarga } from "../modelo-presentacion";
import { formatearFechaISO, formatearTamano } from "../presentacion-ejecucion";

function etiquetaEstado(ejecucion: ResumenDescargaEjecucion) {
  const estado = presentarEjecucionDescarga(ejecucion);
  const estilos =
    estado.tipo === "completada"
      ? "bg-success-50 text-success-700"
      : estado.tipo === "error"
        ? "bg-danger-50 text-danger-700"
        : estado.tipo === "detenida"
          ? "bg-warning-50 text-warning-700"
          : "bg-brand-50 text-brand-700";
  const texto =
    estado.tipo === "completada"
      ? "Disponible"
      : estado.tipo === "error"
        ? "No se pudo generar"
        : estado.tipo === "detenida"
          ? "Ejecución detenida"
          : estado.tipo === "preparando"
            ? "Preparando archivos"
            : "Generando reporte";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${estilos}`}
    >
      {estado.tipo === "completada" && <Icon name="check" size="sm" />}
      {texto}
    </span>
  );
}

export function ListaEjecucionesDescarga({
  ejecuciones,
  onAbrir,
}: {
  ejecuciones: ResumenDescargaEjecucion[];
  onAbrir: (ejecucion: ResumenDescargaEjecucion) => void;
}) {
  return (
    <div className="grid gap-3">
      {ejecuciones.map((ejecucion) => {
        const tamano = ejecucion.archivos.reduce(
          (suma, archivo) => suma + archivo.tamano,
          0,
        );
        return (
          <article
            key={ejecucion.id}
            className="rounded-xl border border-line-200 bg-surface p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-subtle text-ink-500">
                  <Icon name="clock" size="md" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900">
                    {formatearFechaISO(ejecucion.creadoEn)}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {ejecucion.estado === "completada"
                      ? "Generado correctamente"
                      : "Resultado de la ejecución"}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {ejecucion.archivos.length}{" "}
                    {ejecucion.archivos.length === 1 ? "archivo" : "archivos"}
                    {ejecucion.archivos.length
                      ? ` · ${formatearTamano(tamano)}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                {etiquetaEstado(ejecucion)}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAbrir(ejecucion)}
                >
                  Ver archivos <Icon name="chev" size="sm" />
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

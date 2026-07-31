import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { formatearBytes, formatearCostoUsd } from "../utiles-creador-reporte";

interface Estimacion {
  costoEstimadoUsd: number;
  bytesProcesados: number;
}

interface Props {
  tabla: string;
  cantidadCampos: number;
  periodo: string;
  requisitoPendiente: string | null;
  estimacion?: Estimacion;
  cargandoCosto: boolean;
  errorCosto?: string;
  guardando: boolean;
  editando?: boolean;
  onCrear: () => void;
  onCancelar?: () => void;
}

export function ResumenCreacionReporte({
  tabla,
  cantidadCampos,
  periodo,
  requisitoPendiente,
  estimacion,
  cargandoCosto,
  errorCosto,
  guardando,
  editando = false,
  onCrear,
  onCancelar,
}: Props) {
  return (
    <section className="sticky bottom-4 z-20 rounded-xl border border-line-200 bg-surface/95 p-4 shadow-panel backdrop-blur-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
            <span className="truncate"><strong className="text-ink-900">Tabla:</strong> {tabla || "Pendiente"}</span>
            <span><strong className="text-ink-900">Campos:</strong> {cantidadCampos} campos</span>
            <span><strong className="text-ink-900">Periodo:</strong> {periodo}</span>
          </div>
          <div className="mt-2" aria-live="polite">
            {requisitoPendiente ? (
              <p className="flex items-center gap-2 text-xs font-medium text-amber-800">
                <Icon name="info" size="sm" />
                {requisitoPendiente}
              </p>
            ) : errorCosto ? (
              <p className="text-xs text-ink-500">{errorCosto}</p>
            ) : cargandoCosto ? (
              <p className="text-xs text-ink-500">Calculando costo estimado…</p>
            ) : estimacion ? (
              <p className="text-xs text-ink-500">
                Costo estimado: <strong className="text-ink-900">{formatearCostoUsd(estimacion.costoEstimadoUsd)}</strong>
                {" · "}{formatearBytes(estimacion.bytesProcesados)} procesados
              </p>
            ) : (
              <p className="text-xs text-ink-500">
                El costo aparecerá cuando la selección esté completa.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancelar && (
            <Button type="button" variant="outline" disabled={guardando} onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            disabled={Boolean(requisitoPendiente) || guardando}
            onClick={onCrear}
            className="min-w-44 gap-2"
          >
            <Icon name="file-text" size="sm" />
            {guardando
              ? editando
                ? "Guardando cambios…"
                : "Creando reporte…"
              : editando
                ? "Guardar cambios"
                : "Crear reporte"}
          </Button>
        </div>
      </div>
    </section>
  );
}
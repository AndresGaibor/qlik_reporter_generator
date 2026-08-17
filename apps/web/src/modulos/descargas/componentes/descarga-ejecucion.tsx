import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { EstadoDescarga } from "../use-descarga-ejecucion";

interface DescargaEjecucionProps {
  estado: EstadoDescarga;
  progreso: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
  onDescargar: () => void;
  onCancelar: () => void;
}

export function DescargaEjecucion({
  estado,
  progreso,
  totalArchivos,
  archivoActual,
  error,
  onDescargar,
  onCancelar,
}: DescargaEjecucionProps) {
  if (estado === "idle" || estado === "completada") {
    return (
      <Button onClick={onDescargar} disabled={estado === "idle" && false}>
        <Icon name="ext" size="sm" />
        Descargar archivos
      </Button>
    );
  }

  if (estado === "solicitando_manifiesto") {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
        Obteniendo archivos…
      </div>
    );
  }

  if (estado === "descargando") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-ink-500">
          <span>
            {progreso} / {totalArchivos}
          </span>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
          <div
            className="h-full bg-brand-600 transition-all duration-300"
            style={{ width: `${totalArchivos > 0 ? (progreso / totalArchivos) * 100 : 0}%` }}
          />
        </div>
        {archivoActual && (
          <p className="text-xs text-ink-400 truncate">{archivoActual}</p>
        )}
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-danger-600">{error}</span>
        <Button variant="outline" size="sm" onClick={onDescargar}>
          Reintentar
        </Button>
      </div>
    );
  }

  return null;
}

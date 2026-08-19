import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import {
  formatearFechaISO,
  formatearTamano,
  presentarEjecucion,
} from "../presentacion-ejecucion";
import type { EstadoDescarga } from "../use-descarga-ejecucion";
import { DescargaEjecucion } from "./descarga-ejecucion";

interface TarjetaEjecucionDescargaProps {
  ejecucion: ResumenDescargaEjecucion;
  estadoDescarga: EstadoDescarga;
  progreso: number;
  porcentaje: number;
  bytesDescargados: number;
  totalBytes: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
  onDescargar: () => void;
  onDescargarArchivo: (nombre: string) => void;
  onCancelar: () => void;
}

export function TarjetaEjecucionDescarga({
  ejecucion,
  estadoDescarga,
  progreso,
  porcentaje,
  bytesDescargados,
  totalBytes,
  totalArchivos,
  archivoActual,
  error,
  onDescargar,
  onDescargarArchivo,
  onCancelar,
}: TarjetaEjecucionDescargaProps) {
  const presentacion = presentarEjecucion(ejecucion);
  const archivos = ejecucion.archivos ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">
          {ejecucion.reporteNombre}
        </CardTitle>
        <EstadoIcono estado={presentacion} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-ink-500">
          <span>{formatearFechaISO(ejecucion.creadoEn)}</span>
          <EstadoTexto estado={presentacion} />
        </div>

        {presentacion.tipo === "error" && presentacion.mensaje && (
          <p className="text-sm text-danger-600">{presentacion.mensaje}</p>
        )}

        {archivos.length > 0 && (
          <div className="space-y-2">
            {archivos.map((archivo) => (
              <div
                key={archivo.nombre}
                className="flex items-center justify-between gap-3 rounded-md border border-line-200 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-800">
                    {archivo.nombre}
                  </p>
                  <p className="text-ink-500">
                    {archivo.formato} · {formatearTamano(archivo.tamano)}
                    {archivo.fecha
                      ? ` · ${formatearFechaISO(archivo.fecha)}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 font-semibold text-brand-700 hover:underline"
                  onClick={() => onDescargarArchivo(archivo.nombre)}
                >
                  Descargar
                </button>
              </div>
            ))}
          </div>
        )}

        {presentacion.tipo === "completada" && archivos.length === 0 && (
          <p className="text-xs text-ink-500">
            No hay archivos disponibles en GCS.
          </p>
        )}

        <DescargaEjecucion
          estado={estadoDescarga}
          progreso={progreso}
          porcentaje={porcentaje}
          bytesDescargados={bytesDescargados}
          totalBytes={totalBytes}
          totalArchivos={totalArchivos}
          archivoActual={archivoActual}
          error={error}
          onDescargar={onDescargar}
          onCancelar={onCancelar}
        />
      </CardContent>
    </Card>
  );
}

function EstadoIcono({
  estado,
}: {
  estado: ReturnType<typeof presentarEjecucion>;
}) {
  switch (estado.tipo) {
    case "preparando":
    case "iniciada":
      return (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
      );
    case "completada":
      return <Icon name="check" size="sm" className="text-success-600" />;
    case "error":
      return <Icon name="x" size="sm" className="text-danger-600" />;
    case "detenida":
      return <Icon name="pause" size="sm" className="text-warning-600" />;
  }
}

function EstadoTexto({
  estado,
}: {
  estado: ReturnType<typeof presentarEjecucion>;
}) {
  switch (estado.tipo) {
    case "preparando":
      return <span className="text-ink-500">Generando archivos…</span>;
    case "iniciada":
      return <span className="text-ink-500">Generando archivos…</span>;
    case "completada":
      return <span className="text-success-600">Completada</span>;
    case "error":
      return <span className="text-danger-600">Error</span>;
    case "detenida":
      return <span className="text-warning-600">Detenida</span>;
  }
}

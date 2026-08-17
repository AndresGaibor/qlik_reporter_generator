import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { formatearFechaISO, presentarEjecucion } from "../presentacion-ejecucion";
import { DescargaEjecucion } from "./descarga-ejecucion";
import type { EstadoDescarga } from "../use-descarga-ejecucion";

interface TarjetaEjecucionDescargaProps {
  ejecucion: ResumenDescargaEjecucion;
  estadoDescarga: EstadoDescarga;
  progreso: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
  onDescargar: () => void;
  onCancelar: () => void;
}

export function TarjetaEjecucionDescarga({
  ejecucion,
  estadoDescarga,
  progreso,
  totalArchivos,
  archivoActual,
  error,
  onDescargar,
  onCancelar,
}: TarjetaEjecucionDescargaProps) {
  const presentacion = presentarEjecucion(ejecucion);

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

        <DescargaEjecucion
          estado={estadoDescarga}
          progreso={progreso}
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

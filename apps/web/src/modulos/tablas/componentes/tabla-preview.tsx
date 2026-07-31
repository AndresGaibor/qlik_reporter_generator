import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import {
  formatearValorResultado,
  obtenerColumnasPreview,
} from "../utiles-resultados";

interface Props {
  filas: Array<Record<string, unknown>>;
  cargando: boolean;
  error?: string;
  onReintentar?: () => void;
}

export function TablaPreview({ filas, cargando, error, onReintentar }: Props) {
  if (cargando) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 py-12 text-sm text-ink-500" aria-live="polite">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        Cargando una muestra de datos…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 py-12 text-center" role="alert">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-danger-600">
          <Icon name="x" />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink-900">
          No pudimos cargar la vista previa
        </p>
        <p className="mt-1 max-w-md text-sm text-ink-500">{error}</p>
        {onReintentar && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        Esta tabla no devolvió registros para la vista previa.
      </div>
    );
  }

  const columnas = obtenerColumnasPreview(filas);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 border-b border-line-200 bg-app text-ink-700">
          <tr>
            {columnas.map((columna) => (
              <th key={columna} className="whitespace-nowrap border-r border-line-200 px-3 py-3 font-mono font-semibold last:border-r-0">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-200 font-mono text-ink-700">
          {filas.map((fila, indice) => (
            <tr key={indice} className="hover:bg-hover/70">
              {columnas.map((columna) => {
                const valor = fila[columna];
                return (
                  <td
                    key={columna}
                    title={formatearValorResultado(valor)}
                    className={`max-w-64 truncate whitespace-nowrap border-r border-line-200 px-3 py-2.5 last:border-r-0 ${
                      valor === null || valor === undefined ? "italic text-ink-400" : ""
                    }`}
                  >
                    {formatearValorResultado(valor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

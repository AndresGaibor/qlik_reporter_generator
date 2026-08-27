import { useState } from "react";

interface VistaPreviaReporteProps {
  datos?: {
    columnas: string[];
    filas: string[][];
    filasMuestreadas: number;
    fuentesMuestreadas: string[];
    contieneAgregaciones: boolean;
    advertencias: string[];
    esMuestra: true;
  } | null;
  cargando: boolean;
  error: unknown;
}

export function VistaPreviaReporte({ datos, cargando, error }: VistaPreviaReporteProps) {
  const [tooltip, setTooltip] = useState<{ row: number; col: number; text: string } | null>(null);

  if (cargando) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-line-200 bg-surface">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" role="status" />
          <p className="text-sm text-ink-500">Obteniendo vista previa…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
        <p className="font-semibold">No se pudo obtener la vista previa</p>
        <p className="mt-0.5">{error instanceof Error ? error.message : "Error de BigQuery"}</p>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface p-8 text-center text-sm text-ink-500">
        Sin datos de preview disponibles
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Vista previa del resultado</h3>
          <p className="text-xs text-ink-500">
            Primeras {Math.min(10, datos.filas.length)} filas de una muestra · {datos.filasMuestreadas} filas leídas
            · {datos.fuentesMuestreadas.length} fuente(s)
          </p>
        </div>
        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          Vista previa · datos de muestra
        </span>
      </div>

      {datos.contieneAgregaciones && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Los cálculos agregados se realizan sobre la muestra y pueden diferir del resultado completo.
        </div>
      )}

      {datos.advertencias.map((adv) => (
        <div key={adv} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {adv}
        </div>
      ))}

      <div className="max-h-[360px] overflow-x-auto rounded-lg border border-line-200">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-subtle">
            <tr>
              {datos.columnas.map((col) => (
                <th
                  key={col}
                  className="border-b border-line-200 px-3 py-2 text-left font-semibold text-ink-700 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila, rowIdx) => (
              <tr key={`fila-${rowIdx}`} className="hover:bg-surface-subtle">
                {fila.map((celda, colIdx) => (
                  <td
                    key={`celda-${rowIdx}-${colIdx}`}
                    className="border-b border-line-200 px-3 py-2 font-mono text-xs text-ink-800 truncate max-w-[200px]"
                    title={celda}
                    onMouseEnter={() => celda.length > 20 && setTooltip({ row: rowIdx, col: colIdx, text: celda })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {celda || <span className="text-ink-300">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-400">
        {datos.columnas.length} columnas
      </p>
    </div>
  );
}
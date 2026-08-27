interface VistaPreviaReporteProps {
  datos?: {
    columnas: string[];
    filas: string[][];
    filasReferencia: number;
    fuentesReferencia: string[];
    contieneAgregaciones: boolean;
    advertencias: string[];
    esAproximacion: true;
  } | null;
  cargando: boolean;
  error: unknown;
}

export function VistaPreviaReporte({
  datos,
  cargando,
  error,
}: VistaPreviaReporteProps) {
  if (cargando) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-line-200 bg-surface">
        <div className="flex flex-col items-center gap-2">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"
            role="status"
          />
          <p className="text-sm text-ink-500">Generando vista previa…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
        <p className="font-semibold">No se pudo obtener la vista previa</p>
        <p className="mt-0.5">
          {error instanceof Error
            ? error.message
            : "No se pudo generar la simulación"}
        </p>
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
          <h3 className="text-sm font-semibold text-ink-900">
            Vista previa del resultado
          </h3>
          <p className="text-xs text-ink-500">
            {Math.min(10, datos.filas.length)} filas de vista previa · resultado aproximado
          </p>
        </div>
        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          Vista previa · datos de referencia
        </span>
      </div>

      <p className="text-xs text-ink-500">
        La vista previa combina valores de referencia de las fuentes con transformaciones simuladas. No representa el resultado completo del reporte.
      </p>

      {datos.contieneAgregaciones && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Los cálculos mostrados son simulados localmente sobre los datos disponibles y solo ilustran la forma del resultado final.
        </div>
      )}

      {datos.advertencias.map((adv) => (
        <div
          key={adv}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
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
            {datos.filas.map((fila) => (
              <tr key={fila.join("\u001f")} className="hover:bg-surface-subtle">
                {datos.columnas.map((columna, colIdx) => {
                  const celda = fila[colIdx] ?? "";
                  return (
                    <td
                      key={columna}
                      className="border-b border-line-200 px-3 py-2 font-mono text-xs text-ink-800 truncate max-w-[200px]"
                      title={celda}
                    >
                      {celda || <span className="text-ink-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-400">
        {datos.columnas.length} columnas · representación aproximada generada localmente
      </p>
    </div>
  );
}

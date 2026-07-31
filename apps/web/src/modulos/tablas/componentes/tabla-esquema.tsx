interface Props {
  columnas: Array<{ nombre: string; tipo: string }>;
}

function describirTipo(tipo: string): string {
  const valor = tipo.toUpperCase();
  if (valor.includes("STRING") || valor.includes("CHAR")) return "Texto";
  if (valor.includes("INT")) return "Número entero";
  if (valor.includes("NUMERIC") || valor.includes("FLOAT") || valor.includes("DECIMAL")) {
    return "Número decimal";
  }
  if (valor.includes("DATE") || valor.includes("TIME")) return "Fecha u hora";
  if (valor.includes("BOOL")) return "Sí o no";
  if (valor.includes("JSON") || valor.includes("RECORD") || valor.includes("STRUCT")) {
    return "Estructura";
  }
  return "Dato";
}

export function TablaEsquema({ columnas }: Props) {
  if (columnas.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-ink-500">
        BigQuery no devolvió información de campos para esta tabla.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-line-200 bg-app/70 text-xs font-semibold uppercase tracking-wide text-ink-500">
          <tr>
            <th className="w-14 px-4 py-3">#</th>
            <th className="px-4 py-3">Campo</th>
            <th className="px-4 py-3">Tipo BigQuery</th>
            <th className="px-4 py-3">Interpretación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-200">
          {columnas.map((columna, indice) => (
            <tr key={`${columna.nombre}-${indice}`} className="hover:bg-hover/70">
              <td className="px-4 py-3 text-xs tabular-nums text-ink-400">
                {indice + 1}
              </td>
              <td className="px-4 py-3 font-mono font-medium text-ink-900">
                {columna.nombre}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-md bg-obj-50 px-2 py-1 font-mono text-xs font-semibold text-obj-600">
                  {columna.tipo}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-500">{describirTipo(columna.tipo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

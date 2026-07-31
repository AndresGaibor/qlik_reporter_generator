import { Button } from "@/compartido/componentes/ui/button";
import type { CampoReporte } from "../utiles-creador-reporte";

interface Props {
  campos: CampoReporte[];
  seleccionados: string[];
  filas: Array<Record<string, unknown>>;
  cargando: boolean;
  error?: string;
  onReintentar?: () => void;
}

const MAXIMO_COLUMNAS = 8;

function valorCelda(valor: unknown) {
  if (valor === null || valor === undefined) return "—";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("value" in valor && valor.value !== null && valor.value !== undefined) {
      return String(valor.value);
    }
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}

export function VistaPreviaReporte({
  campos,
  seleccionados,
  filas,
  cargando,
  error,
  onReintentar,
}: Props) {
  const visibles = campos
    .filter((campo) => seleccionados.includes(campo.nombre))
    .slice(0, MAXIMO_COLUMNAS);
  const adicionales = Math.max(0, seleccionados.length - visibles.length);
  return (
    <section
      aria-labelledby="titulo-vista-previa-reporte"
      className="overflow-hidden rounded-xl border border-line-200 bg-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-200 p-4">
        <div>
          <h3 id="titulo-vista-previa-reporte" className="font-semibold text-ink-900">
            Vista previa
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Muestra de hasta 10 registros con los primeros campos seleccionados.
          </p>
        </div>
        {adicionales > 0 && (
          <span className="rounded-full bg-app px-2.5 py-1 text-xs font-medium text-ink-600">
            {adicionales} {adicionales === 1 ? "campo adicional" : "campos adicionales"}
          </span>
        )}
      </div>

      {cargando ? (
        <p className="p-8 text-center text-sm text-ink-500">
          Cargando datos de vista previa…
        </p>
      ) : error ? (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          {onReintentar && (
            <Button type="button" size="sm" variant="outline" onClick={onReintentar} className="mt-3">
              Reintentar
            </Button>
          )}
        </div>
      ) : visibles.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-500">
          Selecciona campos para consultar una vista previa.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-max border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-app/95 backdrop-blur-sm">
              <tr className="border-b border-line-200">
                {visibles.map((campo) => (
                  <th key={campo.nombre} className="min-w-36 px-3 py-2.5">
                    <span className="block max-w-48 truncate font-semibold text-ink-900" title={campo.nombre}>
                      {campo.nombre}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-ink-400">
                      {campo.tipo || "STRING"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-100">
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={visibles.length} className="p-8 text-center text-ink-500">
                    No hay registros para mostrar.
                  </td>
                </tr>
              ) : (
                filas.map((fila, indice) => (
                  <tr key={indice} className="transition-colors hover:bg-hover">
                    {visibles.map((campo) => (
                      <td
                        key={campo.nombre}
                        className="max-w-56 truncate px-3 py-2 font-mono text-ink-700"
                        title={valorCelda(fila[campo.nombre])}
                      >
                        {valorCelda(fila[campo.nombre])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
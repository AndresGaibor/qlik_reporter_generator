import { Icon, type IconName } from "@/compartido/componentes/ui/icon";
import { VisorJsonInteractivo } from "@/compartido/componentes/ui/visor-json-interactivo";

export interface InputParam {
  id: string;
  label?: string;
  type?: string;
  value?: unknown;
}

export interface BloqueProcesado {
  id: string;
  type: string;
  title: string;
  connector?: string;
  operation?: string;
  childId?: string;
  nextBlockId?: string;
  inputs: InputParam[];
  comment?: string | null;
  disabled?: boolean;
}

export function TarjetaBloqueWorkspace({
  bloque,
  idx,
  esUltimo,
  estaSeleccionado,
  datosBloqueRaw,
  badge,
  onToggleSeleccion,
}: {
  bloque: BloqueProcesado;
  idx: number;
  esUltimo: boolean;
  estaSeleccionado: boolean;
  datosBloqueRaw?: Record<string, unknown>;
  badge: { bg: string; icon: IconName; label: string };
  onToggleSeleccion: () => void;
}) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`w-full rounded-2xl border transition-all duration-200 bg-white shadow-sm hover:shadow-md ${
          estaSeleccionado
            ? "border-brand-500 ring-2 ring-brand-100 shadow-md"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-600 text-xs font-bold text-white shadow-sm">
              {idx + 1}
            </span>
            <div>
              <h4 className="font-display font-semibold text-slate-900 text-base flex items-center gap-2">
                {bloque.title}
                {bloque.disabled && (
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                    Deshabilitado
                  </span>
                )}
              </h4>
              {bloque.comment && (
                <p className="text-xs text-slate-500 italic mt-0.5">
                  Comentario: "{bloque.comment}"
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg}`}
            >
              <Icon name={badge.icon} size="sm" />
              {badge.label}
            </span>

            <button
              type="button"
              onClick={onToggleSeleccion}
              className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:bg-brand-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-brand-100 ml-1"
            >
              {estaSeleccionado ? "Ocultar JSON" : "Ver JSON"}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {bloque.inputs.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Parámetros y Entradas ({bloque.inputs.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bloque.inputs.map((inp) => (
                  <div
                    key={inp.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex flex-col justify-between"
                  >
                    <span className="text-slate-500 font-medium text-[11px] block">
                      {inp.label}:
                    </span>
                    <span className="font-mono text-slate-800 font-semibold mt-0.5 truncate break-all">
                      {inp.value === null || inp.value === undefined ? (
                        <span className="text-slate-400 italic">
                          sin configurar
                        </span>
                      ) : typeof inp.value === "object" ? (
                        JSON.stringify(inp.value)
                      ) : (
                        String(inp.value)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              Sin parámetros de entrada adicionales.
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
            <span>ID: {bloque.id}</span>
            {bloque.nextBlockId && (
              <span className="text-brand-600 font-semibold bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">
                Conectado a {bloque.nextBlockId.substring(0, 8)}…
              </span>
            )}
          </div>
        </div>

        {estaSeleccionado && datosBloqueRaw && (
          <div className="border-t border-slate-200 bg-slate-50 p-4 rounded-b-2xl">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2 border-b border-slate-200 pb-2">
              <span className="font-mono text-brand-700 font-semibold">
                ESQUEMA JSON DEL BLOQUE [{bloque.title}]
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(datosBloqueRaw, null, 2),
                  );
                }}
                className="text-[11px] text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md shadow-sm font-medium"
              >
                Copiar Bloque
              </button>
            </div>
            <VisorJsonInteractivo data={datosBloqueRaw} />
          </div>
        )}
      </div>

      {!esUltimo && (
        <div className="flex flex-col items-center py-2">
          <div className="w-0.5 h-6 bg-brand-300" />
          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-brand-100 text-brand-700 border border-brand-200 shadow-sm text-[10px]">
            Ver detalles
          </div>
          <div className="w-0.5 h-2 bg-brand-300" />
        </div>
      )}
    </div>
  );
}

import type { ResumenFlujo } from "../../api";

export function PestanaMetadataFlujo({ flujo }: { flujo: ResumenFlujo }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line-200 bg-surface p-5 shadow-sm space-y-4">
        <h4 className="font-semibold text-sm text-ink-900">
          Detalles del Dataflow
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-app/50 rounded-lg border border-line-200">
            <span className="text-ink-400 block mb-1">ID del Dataflow:</span>
            <span className="font-mono font-semibold text-ink-900">
              {flujo.id}
            </span>
          </div>
          <div className="p-3 bg-app/50 rounded-lg border border-line-200">
            <span className="text-ink-400 block mb-1">
              Espacio en Qlik Cloud:
            </span>
            <span className="font-semibold text-ink-900">
              {flujo.espacioNombre || "Personal"}
            </span>
          </div>
          <div className="p-3 bg-app/50 rounded-lg border border-line-200">
            <span className="text-ink-400 block mb-1">
              Última actualización:
            </span>
            <span className="font-mono text-ink-900">
              {flujo.modificadoEn
                ? new Date(flujo.modificadoEn).toLocaleString()
                : "—"}
            </span>
          </div>
          <div className="p-3 bg-app/50 rounded-lg border border-line-200">
            <span className="text-ink-400 block mb-1">Tipo de Dataflow:</span>
            <span className="font-mono text-brand-600 font-semibold">
              Dataflow de Qlik
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

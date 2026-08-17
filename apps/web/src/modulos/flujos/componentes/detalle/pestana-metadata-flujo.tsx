import { VisorJsonInteractivo } from "@/compartido/componentes/ui/visor-json-interactivo";
import { useState } from "react";
import type { ResumenFlujo } from "../../api";

export function PestanaMetadataFlujo({ flujo }: { flujo: ResumenFlujo }) {
  const [copiadoMeta, setCopiadoMeta] = useState(false);

  const metadataDataflow = {
    id: flujo.id,
    name: flujo.nombre,
    resourceType: "app",
    resourceSubType: "qix-df",
    spaceId: flujo.espacioId || null,
    spaceName: flujo.espacioNombre || "Personal",
    updatedAt: flujo.modificadoEn || null,
    engine: "QIX Data Pipeline Engine",
  };

  const copiarMetadata = () => {
    navigator.clipboard.writeText(JSON.stringify(metadataDataflow, null, 2));
    setCopiadoMeta(true);
    setTimeout(() => setCopiadoMeta(false), 2000);
  };

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

      <details className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <summary className="cursor-pointer font-medium text-xs text-brand-600 hover:underline">
          Ver JSON avanzado (para usuarios con experiencia técnica)
        </summary>
        <div className="mt-3 text-[11px] font-mono text-slate-500 border-t border-slate-200 pt-3 flex justify-between items-center">
          <span>METADATA_JSON_DATAFLOW</span>
          <button
            type="button"
            onClick={copiarMetadata}
            className="text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded transition-colors font-medium"
          >
            {copiadoMeta ? "¡JSON Copiado!" : "Copiar JSON"}
          </button>
        </div>
        <VisorJsonInteractivo data={metadataDataflow} />
      </details>
    </div>
  );
}

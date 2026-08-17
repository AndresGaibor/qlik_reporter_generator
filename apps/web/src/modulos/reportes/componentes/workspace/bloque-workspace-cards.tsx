import { Icon } from "@/compartido/componentes/ui/icon";
import { useState } from "react";
import type { BloqueInfo, ParamEntry, VariableInfo } from "./parser-workspace-util";

export function BloqueCard({ bloque }: { bloque: BloqueInfo }) {
  const [expandido, setExpandido] = useState(false);
  const tieneContenido =
    bloque.parametros.length > 0 || bloque.grupos.length > 0;

  return (
    <div className="rounded-lg border border-line-200 bg-app/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
      >
        <Icon name="robot" size="sm" className="text-brand-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-ink-900 truncate">
            {bloque.nombre}
          </div>
          <div className="text-xs text-ink-400 font-mono truncate">
            {bloque.tipo}
          </div>
        </div>
        <Icon
          name="chev"
          size="sm"
          className={`text-ink-400 transition-transform shrink-0 ${expandido ? "rotate-180" : ""}`}
        />
      </button>

      {expandido && tieneContenido && (
        <div className="border-t border-line-200 bg-surface px-4 py-3">
          <div className="space-y-2">
            {bloque.parametros.map((p) => (
              <div
                key={p.clave}
                className="grid grid-cols-[140px_1fr] gap-x-2 text-xs"
              >
                <span className="font-mono text-ink-500 shrink-0 truncate pt-0.5">
                  {p.clave}
                </span>
                <ValorCelda valor={p.valor} />
              </div>
            ))}
            {bloque.grupos.map((g) => (
              <GrupoArray key={g.clave} grupo={g} />
            ))}
          </div>
        </div>
      )}

      {expandido && !tieneContenido && (
        <div className="border-t border-line-200 bg-surface px-4 py-3 text-xs text-ink-400">
          Sin parámetros configurados
        </div>
      )}
    </div>
  );
}

export function VariableCard({ variable }: { variable: VariableInfo }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-line-100 last:border-b-0">
      <Icon name="db" size="sm" className="text-obj-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-ink-900">
          {variable.nombre}
        </div>
        <div className="mt-0.5">
          <ValorCelda valor={variable.valor} />
        </div>
      </div>
    </div>
  );
}

function GrupoArray({
  grupo,
}: { grupo: { clave: string; items: ParamEntry[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line-100 rounded-md overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-ink-50 hover:bg-ink-100 transition-colors text-left"
      >
        <span className="text-xs text-ink-400">{open ? "Ocultar" : "Ver"}</span>
        <span className="font-semibold text-xs text-ink-700">
          {grupo.clave}
        </span>
        <span className="text-xs text-ink-400">
          ({grupo.items.length} items)
        </span>
      </button>
      {open && (
        <div className="divide-y divide-line-100">
          {grupo.items.map((item, idx) => (
            <div
              key={`${grupo.clave}-${idx}`}
              className="grid grid-cols-[140px_1fr] gap-x-2 px-3 py-1.5"
            >
              <span className="font-mono text-xs text-ink-500 truncate">
                {item.clave}
              </span>
              <ValorCelda valor={item.valor} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ValorCelda({ valor }: { valor: unknown }) {
  if (typeof valor === "boolean") {
    return (
      <span
        className={`font-mono text-xs px-1.5 py-0.5 rounded ${valor ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600"}`}
      >
        {valor ? "true" : "false"}
      </span>
    );
  }
  if (typeof valor === "number") {
    return <span className="font-mono text-xs text-ink-700">{valor}</span>;
  }
  if (valor === null || valor === undefined || valor === "") {
    return <span className="font-mono text-xs text-ink-400 italic">—</span>;
  }
  if (typeof valor === "string") {
    if (valor.length > 60) {
      return <JsonVer data={valor} />;
    }
    return (
      <span className="font-mono text-xs text-ink-700 break-all">{valor}</span>
    );
  }
  return <JsonVer data={valor} />;
}

function JsonVer({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen(!open)} className="text-left">
      <span className="text-xs text-ink-400 font-medium">
        {open ? "Ocultar" : "Ver"} valor
      </span>
      {open && (
        <pre className="mt-1 p-2 bg-ink-50 rounded text-xs font-mono text-ink-700 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </button>
  );
}

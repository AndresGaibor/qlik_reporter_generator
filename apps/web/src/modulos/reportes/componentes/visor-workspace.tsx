import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import {
  type ResumenFlujo,
  obtenerFlujosConFiltros,
} from "@/modulos/flujos/api";
import type { WorkspaceAutomatizacion } from "@/modulos/reportes/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BloqueCard,
  VariableCard,
} from "./workspace/bloque-workspace-cards";
import {
  extraerBloques,
  extraerVariables,
} from "./workspace/parser-workspace-util";

interface Props {
  workspace: WorkspaceAutomatizacion;
}

export function VisorWorkspace({ workspace }: Props) {
  const [expandidoGlobal, setExpandidoGlobal] = useState(true);
  const bloques = extraerBloques(workspace.workspace);
  const variables = extraerVariables(workspace.workspace);

  const { data: flujos = [] } = useQuery<ResumenFlujo[]>({
    queryKey: ["flujos"],
    queryFn: () => obtenerFlujosConFiltros(),
    staleTime: 60 * 1000,
  });

  if (bloques.length === 0 && variables.length === 0) {
    return (
      <Card className="border-line-200 bg-surface shadow-card">
        <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
          <CardTitle className="font-display text-lg font-semibold text-ink-900">
            Estructura del Workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center text-sm text-ink-400">
          No se encontraron bloques ni variables en el workspace de esta
          automatización.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="font-display text-lg font-semibold text-ink-900">
              Estructura del Workspace
            </CardTitle>
            {bloques.length > 0 && (
              <span className="text-xs text-ink-400 font-mono bg-ink-100 rounded-full px-2 py-0.5">
                {bloques.length} {bloques.length === 1 ? "bloque" : "bloques"}
              </span>
            )}
            {variables.length > 0 && (
              <span className="text-xs text-ink-400 font-mono bg-obj-100 text-obj-700 rounded-full px-2 py-0.5">
                {variables.length}{" "}
                {variables.length === 1 ? "variable" : "variables"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandidoGlobal(!expandidoGlobal)}
            className="text-xs text-ink-500 hover:text-ink-700 font-medium transition-colors"
          >
            {expandidoGlobal ? "Colapsar todos" : "Expandir todos"}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-6">
        {(() => {
          const varAppid = String(
            variables.find((v) => v.nombre === "Appid")?.valor || "",
          );
          const varDataset = String(
            variables.find((v) => v.nombre === "Dataset")?.valor || "",
          );
          const varArchivo = String(
            variables.find((v) => v.nombre === "ArchivoEntrada")?.valor || "",
          );
          const varTabla = String(
            variables.find((v) => v.nombre === "TablaDestino")?.valor || "",
          );
          const varExt = String(
            variables.find((v) => v.nombre === "Extension")?.valor || "",
          );

          const tieneRefDataflow = Boolean(varAppid || varDataset || varTabla);

          if (!tieneRefDataflow) return null;

          const flujoEncontrado = flujos.find(
            (f) =>
              f.id === varAppid ||
              f.nombre
                .toLowerCase()
                .includes((varDataset || varArchivo).toLowerCase()),
          );
          const nombreDataflow =
            flujoEncontrado?.nombre ||
            varDataset ||
            varArchivo ||
            (varAppid ? `Flujo (${varAppid.slice(0, 8)}...)` : "—");

          return (
            <div className="rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50/70 via-white to-sky-50/50 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display font-semibold text-sm text-brand-900">
                  <Icon name="flow" size="sm" className="text-brand-600" />
                  Orquestación de Datos Referenciada
                </div>
                <span className="text-[11px] font-medium bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full border border-brand-200">
                  Dataflow hacia destino
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                <div className="p-3 bg-white/90 rounded-lg border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Dataflow Origen
                  </span>
                  <div
                    className="font-semibold text-xs text-brand-700 truncate"
                    title={nombreDataflow}
                  >
                    {flujoEncontrado ? (
                      <Link
                        to="/flujos/$id"
                        params={{ id: flujoEncontrado.id }}
                        className="hover:underline flex items-center gap-1.5"
                      >
                        <Icon
                          name="cloud"
                          size="sm"
                          className="text-brand-600 shrink-0"
                        />
                        <span className="truncate">{nombreDataflow}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/flujos"
                        className="hover:underline flex items-center gap-1.5"
                      >
                        <Icon
                          name="cloud"
                          size="sm"
                          className="text-brand-600 shrink-0"
                        />
                        <span className="truncate">{nombreDataflow}</span>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-lg border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Dataset / Archivo
                  </span>
                  <div className="font-medium text-xs text-slate-800 truncate">
                    {varArchivo || varDataset ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-semibold text-indigo-700">
                          {varArchivo || varDataset}
                        </span>
                        {Boolean(varExt) && (
                          <span className="text-[10px] bg-slate-100 px-1 rounded text-slate-500 font-mono">
                            .{varExt}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-lg border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Tabla Destino
                  </span>
                  <div
                    className="font-mono text-xs font-bold text-emerald-700 truncate"
                    title={varTabla}
                  >
                    {varTabla ? varTabla : "—"}
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-lg border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Motor Ejecutor
                  </span>
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Talend + BigQuery
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {bloques.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2 px-1">
              Bloques
            </div>
            <div className="space-y-2">
              {bloques.map((bloque) => (
                <BloqueCard key={bloque.nombre} bloque={bloque} />
              ))}
            </div>
          </div>
        )}

        {variables.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2 px-1">
              Variables
            </div>
            <div className="rounded-lg border border-line-200 bg-app/40 overflow-hidden">
              {variables.map((variable) => (
                <VariableCard key={variable.nombre} variable={variable} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

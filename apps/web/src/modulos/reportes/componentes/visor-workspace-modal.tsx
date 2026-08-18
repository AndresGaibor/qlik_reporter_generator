import { Button } from "@/compartido/componentes/ui/button";
import { Icon, type IconName } from "@/compartido/componentes/ui/icon";
import { VisorJsonInteractivo } from "@/compartido/componentes/ui/visor-json-interactivo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  type WorkspaceAutomatizacion,
  obtenerWorkspaceAutomatizacion,
} from "../api";
import {
  type BloqueProcesado,
  type InputParam,
  TarjetaBloqueWorkspace,
} from "./workspace/tarjeta-bloque-workspace";

interface Props {
  automatizacionId: string;
  nombreAutomatizacion: string;
}

export function VisorWorkspaceModal({
  automatizacionId,
  nombreAutomatizacion,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"bloques" | "json">("bloques");
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState<string | null>(
    null,
  );
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading, isError, error } = useQuery<WorkspaceAutomatizacion>(
    {
      queryKey: ["automatizacion-workspace", automatizacionId],
      queryFn: () => obtenerWorkspaceAutomatizacion(automatizacionId),
      enabled: abierto,
      staleTime: 60 * 1000,
    },
  );

  const workspaceObj = data?.workspace || {};
  const bloquesRaw = (
    Array.isArray(workspaceObj.blocks) ? workspaceObj.blocks : []
  ) as Record<string, unknown>[];

  const bloques: BloqueProcesado[] = bloquesRaw.map((b) => {
    const rawInputs = (Array.isArray(b.inputs) ? b.inputs : []) as Record<
      string,
      unknown
    >[];
    const inputs: InputParam[] = rawInputs.map((inp) => ({
      id: String(inp.id || inp.name || ""),
      label: inp.label ? String(inp.label) : String(inp.id || inp.name || ""),
      type: inp.type ? String(inp.type) : undefined,
      value: inp.value,
    }));

    return {
      id: String(b.id || ""),
      type: String(b.type || b.blockType || "Block"),
      title: String(
        b.displayName || b.name || b.title || b.type || "Bloque sin título",
      ),
      connector:
        b.connector || b.connectorId
          ? String(b.connector || b.connectorId)
          : undefined,
      operation:
        b.operation || b.action ? String(b.operation || b.action) : undefined,
      childId: b.childId ? String(b.childId) : undefined,
      nextBlockId: b.nextBlockId
        ? String(b.nextBlockId)
        : b.childId
          ? String(b.childId)
          : undefined,
      inputs,
      comment: typeof b.comment === "string" ? b.comment : null,
      disabled: Boolean(b.disabled),
    };
  });

  const copiarJson = () => {
    const texto = JSON.stringify(workspaceObj, null, 2);
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const getTipoBadges = (
    type: string,
  ): { bg: string; icon: IconName; label: string } => {
    if (type.includes("Start"))
      return {
        bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: "play",
        label: "Inicio / Disparador",
      };
    if (type.includes("Endpoint"))
      return {
        bg: "bg-sky-50 text-sky-700 border-sky-200",
        icon: "zap",
        label: "Acción API / Conector",
      };
    if (type.includes("Show") || type.includes("Output"))
      return {
        bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
        icon: "sparkles",
        label: "Salida / Output",
      };
    if (type.includes("Stop"))
      return {
        bg: "bg-rose-50 text-rose-700 border-rose-200",
        icon: "x",
        label: "Fin de Flujo",
      };
    return {
      bg: "bg-slate-100 text-slate-700 border-slate-200",
      icon: "flow",
      label: type,
    };
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
        className="text-xs gap-1.5 border-line-300 hover:bg-app"
      >
        <Icon name="edit" size="sm" className="text-brand-600" />
        Ver Script / Workspace
      </Button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="flex flex-col w-full max-w-4xl max-h-[88vh] bg-surface rounded-xl border border-line-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line-200 bg-app/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600 border border-brand-100">
                  <Icon name="zap" size="md" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg text-ink-900">
                    Flujo Visual de Automate
                  </h3>
                  <p className="text-xs text-ink-500 font-mono">
                    {nombreAutomatizacion} (ID: {automatizacionId})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 sm:inline-flex">
                  Solo lectura
                </span>
                <div className="flex rounded-lg bg-line-200/60 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPestana("bloques")}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                      pestana === "bloques"
                        ? "bg-surface text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    Pasos de la automatización ({bloques.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPestana("json")}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                      pestana === "json"
                        ? "bg-surface text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    JSON del workspace
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-line-200/50 transition-colors"
                >
                  <Icon name="x" size="md" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70">
              {isLoading && (
                <div className="flex min-h-[350px] flex-col items-center justify-center gap-2">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  <p className="text-sm text-ink-500 font-medium">
                    Cargando la topología de la automatización...
                  </p>
                </div>
              )}

              {isError && (
                <div className="rounded-lg border border-danger-200 bg-red-50 p-4 text-sm text-danger-700">
                  <p className="font-semibold mb-1">
                    Error al obtener el workspace:
                  </p>
                  <p className="font-mono text-xs">
                    {(error as Error)?.message || "Error desconocido"}
                  </p>
                </div>
              )}

              {!isLoading && !isError && data && (
                <>
                  {pestana === "bloques" && (
                    <div className="space-y-6 max-w-3xl mx-auto">
                      <div className="flex items-center justify-between text-xs text-slate-500 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-700">
                          <Icon
                            name="flow"
                            size="sm"
                            className="text-brand-600"
                          />
                          Secuencia ejecutable de bloques conectados
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={copiarJson}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors"
                          >
                            <Icon name="copy" size="sm" />
                            {copiado ? "¡Copiado!" : "Copiar JSON Workspace"}
                          </button>
                        </div>
                      </div>

                      {bloques.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500 text-sm bg-white">
                          No se encontraron bloques explícitos en este workspace
                          o el script está vacío.
                        </div>
                      ) : (
                        <div className="relative space-y-0">
                          {bloques.map((bloque, idx) => (
                            <TarjetaBloqueWorkspace
                              key={bloque.id || idx}
                              bloque={bloque}
                              idx={idx}
                              esUltimo={idx === bloques.length - 1}
                              estaSeleccionado={
                                bloqueSeleccionado === bloque.id
                              }
                              datosBloqueRaw={bloquesRaw.find(
                                (b) => String(b.id) === bloque.id,
                              )}
                              badge={getTipoBadges(bloque.type)}
                              onToggleSeleccion={() =>
                                setBloqueSeleccionado(
                                  bloqueSeleccionado === bloque.id
                                    ? null
                                    : bloque.id,
                                )
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {pestana === "json" && (
                    <div className="mx-auto max-w-4xl space-y-4">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-line-200 bg-white px-4 py-3 text-xs text-ink-600 shadow-sm">
                        <span>
                          Workspace de Qlik Automate en modo claro. Solo
                          lectura.
                        </span>
                        <button
                          type="button"
                          onClick={copiarJson}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line-300 bg-white px-2.5 py-1 font-semibold text-ink-700 transition-colors hover:bg-app"
                        >
                          <Icon name="copy" size="sm" />
                          {copiado ? "¡Copiado!" : "Copiar JSON"}
                        </button>
                      </div>
                      <div className="min-h-[400px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <VisorJsonInteractivo data={workspaceObj} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

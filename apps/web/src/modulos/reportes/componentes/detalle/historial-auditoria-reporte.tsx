import { Icon } from "@/compartido/componentes/ui/icon";
import type { DetalleEjecucionReporte } from "@qlik/contratos";
import { useEffect, useState } from "react";
import { calcularDuracion } from "../../utiles-presentacion-reporte";

function formatearTamanoBytes(valor: string | null | undefined): string {
  if (!valor) return "—";
  const num = Number(valor);
  if (Number.isNaN(num)) return valor;
  if (num === 0) return "0 B";
  const k = 1024;
  const tamanos = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${Number.parseFloat((num / k ** i).toFixed(1))} ${tamanos[i]}`;
}

function formatearDuracionMs(ms: number): string {
  const segundos = Math.floor(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  if (minutos === 0) return `${resto} s`;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}

export function HistorialAuditoriaReporte({
  ejecuciones,
  mostrarDetallesTecnicos,
}: {
  ejecuciones: DetalleEjecucionReporte[];
  mostrarDetallesTecnicos: boolean;
}) {
  const ahora = useRelojEjecuciones(ejecuciones);
  return (
    <section className="rounded-xl border border-line-200 bg-surface shadow-card">
      <div className="border-b border-line-200 px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
          Auditoría de ejecuciones
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
          Dataflow y SQL realmente utilizados
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Cada ejecución conserva su huella, snapshot y scripts aunque el
          Dataflow cambie después.
        </p>
      </div>

      {ejecuciones.length === 0 ? (
        <div className="px-5 py-8 text-sm text-ink-500 sm:px-6">
          Todavía no hay ejecuciones auditadas desde la plataforma.
        </div>
      ) : (
        <div className="divide-y divide-line-200">
          {ejecuciones.map((ejecucion) => (
            <article key={ejecucion.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoAuditoria estado={ejecucion.estado} />
                    <span className="rounded-full bg-app px-2.5 py-1 text-xs font-semibold text-ink-600">
                      Manual
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink-800">
                    {formatearFecha(ejecucion.iniciadoEn ?? ejecucion.creadoEn)}
                  </p>
                  <p className="mt-1 text-sm text-ink-500">
                    {textoFase(ejecucion.estado)} · Tiempo transcurrido:{" "}
                    <span className="font-semibold text-ink-700">
                      {ejecucion.metricas?.duracionTotalMs != null
                        ? formatearDuracionMs(ejecucion.metricas.duracionTotalMs)
                        : calcularDuracion(
                            ejecucion.iniciadoEn ?? ejecucion.creadoEn,
                            ejecucion.finalizadoEn ?? undefined,
                            ahora,
                          )}
                    </span>
                    {ejecucion.metricas?.duracionBigQueryMs != null && (
                      <>
                        {" · "}
                        BigQuery:{" "}
                        <span className="font-semibold text-ink-700">
                          {formatearDuracionMs(
                            ejecucion.metricas.duracionBigQueryMs,
                          )}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {mostrarDetallesTecnicos && (
                  <div className="text-right">
                    <p className="text-xs text-ink-400">SHA-256</p>
                    <p className="font-mono text-xs font-semibold text-ink-700">
                      {ejecucion.hashDataflowSha256.slice(0, 16)}…
                    </p>
                  </div>
                )}
              </div>

              <p className="mt-3 break-all font-mono text-[11px] text-ink-500">
                {ejecucion.uriBaseGcs}
              </p>

              {ejecucion.mensajeError ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {presentarMensajeError(ejecucion)}
                </p>
              ) : null}

              {mostrarDetallesTecnicos && (
                <details className="mt-3 rounded-lg border border-line-200 bg-app">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-700">
                    Ver auditoría técnica
                  </summary>
                  <div className="space-y-4 border-t border-line-200 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        SHA-256 completo
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-ink-700">
                        {ejecucion.hashDataflowSha256}
                      </p>
                    </div>
                    <BloqueCodigo
                      titulo="Script Dataflow utilizado"
                      contenido={ejecucion.scriptDataflow}
                    />
                    <BloqueCodigo
                      titulo="SQL BigQuery compilado"
                      contenido={ejecucion.sqlBigQueryCompilado}
                    />
                    <BloqueCodigo
                      titulo="Script enviado a Talend"
                      contenido={ejecucion.scriptExportacion}
                    />
                    <div className="grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                      <span>Compilador: v{ejecucion.versionCompilador}</span>
                    </div>
                    {(ejecucion.metricas || ejecucion.jobIdBigQuery) && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                          BigQuery
                        </p>
                        <div className="grid gap-2 rounded-lg border border-line-200 bg-surface-subtle p-3">
                          {ejecucion.metricas && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                              {ejecucion.metricas.duracionBigQueryMs !=
                                null && (
                                <span className="text-ink-500">
                                  Duración BQ:{" "}
                                  <span className="font-semibold text-ink-700">
                                    {formatearDuracionMs(
                                      ejecucion.metricas.duracionBigQueryMs,
                                    )}
                                  </span>
                                </span>
                              )}
                              {ejecucion.metricas.totalBytesProcessed && (
                                <span className="text-ink-500">
                                  Procesado:{" "}
                                  <span className="font-semibold text-ink-700">
                                    {formatearTamanoBytes(
                                      ejecucion.metricas.totalBytesProcessed,
                                    )}
                                  </span>
                                </span>
                              )}
                              {ejecucion.metricas.totalBytesBilled && (
                                <span className="text-ink-500">
                                  Facturado:{" "}
                                  <span className="font-semibold text-ink-700">
                                    {formatearTamanoBytes(
                                      ejecucion.metricas.totalBytesBilled,
                                    )}
                                  </span>
                                </span>
                              )}
                              {ejecucion.metricas.totalSlotMs && (
                                <span className="text-ink-500">
                                  Slot ms:{" "}
                                  <span className="font-semibold text-ink-700">
                                    {ejecucion.metricas.totalSlotMs}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {ejecucion.jobIdBigQuery && (
                              <LineaTecnicaCopy
                                etiqueta="Job BQ"
                                valor={ejecucion.jobIdBigQuery}
                              />
                            )}
                            {ejecucion.bigQueryProjectId && (
                              <span className="text-xs text-ink-500">
                                Proyecto:{" "}
                                <span className="font-mono text-xs text-ink-700">
                                  {ejecucion.bigQueryProjectId}
                                </span>
                              </span>
                            )}
                            {ejecucion.bigQueryLocation && (
                              <span className="text-xs text-ink-500">
                                Location:{" "}
                                <span className="font-mono text-xs text-ink-700">
                                  {ejecucion.bigQueryLocation}
                                </span>
                              </span>
                            )}
                            {ejecucion.runIdQlik && (
                              <LineaTecnicaCopy
                                etiqueta="Run Qlik"
                                valor={ejecucion.runIdQlik}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function useRelojEjecuciones(ejecuciones: DetalleEjecucionReporte[]) {
  const [ahora, setAhora] = useState(() => Date.now());
  const hayActivas = ejecuciones.some(
    (item) => item.estado === "preparando" || item.estado === "iniciada",
  );

  useEffect(() => {
    if (!hayActivas) return;
    setAhora(Date.now());
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1_000);
    return () => window.clearInterval(intervalo);
  }, [hayActivas]);

  return ahora;
}

function textoFase(estado: string) {
  switch (estado) {
    case "preparando":
      return "Preparando ejecución";
    case "iniciada":
      return "Automatización o job en ejecución";
    case "completada":
      return "Archivos generados";
    case "error":
      return "Ejecución fallida";
    case "detenida":
      return "Ejecución detenida";
    default:
      return "Estado desconocido";
  }
}

function presentarMensajeError(ejecucion: DetalleEjecucionReporte): string {
  const mensaje = ejecucion.mensajeError?.toLowerCase() ?? "";
  if (
    ejecucion.etapaError === "talend" &&
    mensaje.includes("409") &&
    mensaje.includes("duplicate")
  ) {
    return "La exportación no pudo iniciarse porque ya existe una solicitud con el mismo identificador. Intenta nuevamente en unos minutos.";
  }

  return ejecucion.mensajeError ?? "";
}

function EstadoAuditoria({ estado }: { estado: string }) {
  const clases =
    estado === "completada"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estado === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : estado === "detenida"
          ? "border-line-200 bg-app text-ink-600"
          : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${clases}`}
    >
      {estado}
    </span>
  );
}

function BloqueCodigo({
  titulo,
  contenido,
}: {
  titulo: string;
  contenido: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {titulo}
      </p>
      <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-line-200 bg-surface p-3 text-[11px] leading-5 text-ink-700 shadow-sm">
        {contenido}
      </pre>
    </div>
  );
}

function formatearFecha(valor: string | null | undefined) {
  if (!valor) return "Sin fecha";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);
}

function LineaTecnicaCopy({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-ink-500">{etiqueta}:</span>
      <span className="font-mono text-xs text-ink-700">{valor}</span>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(valor)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-ink-500 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`Copiar ${etiqueta}`}
      >
        <Icon name="copy" size="sm" />
        Copiar
      </button>
    </span>
  );
}

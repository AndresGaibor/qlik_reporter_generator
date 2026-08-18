import type { DetalleEjecucionReporte } from "@qlik/contratos";

export function HistorialAuditoriaReporte({
  ejecuciones,
  mostrarDetallesTecnicos,
}: {
  ejecuciones: DetalleEjecucionReporte[];
  mostrarDetallesTecnicos: boolean;
}) {
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
                  {ejecucion.etapaError ? `${ejecucion.etapaError}: ` : ""}
                  {ejecucion.mensajeError}
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
                      <span>Qlik run: {ejecucion.runIdQlik ?? "—"}</span>
                      <span>Compilador: v{ejecucion.versionCompilador}</span>
                    </div>
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
}: { titulo: string; contenido: string }) {
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

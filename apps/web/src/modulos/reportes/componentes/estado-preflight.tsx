import type { preflightDataflowReporte } from "../../api";

export function EstadoPreflight({
  validando,
  error,
  preflight,
}: {
  validando: boolean;
  error?: unknown;
  preflight?: Awaited<ReturnType<typeof preflightDataflowReporte>>;
}) {
  if (validando) {
    return (
      <section className="rounded-lg border border-line-200 bg-app px-4 py-5 text-sm text-ink-500">
        Analizando el Dataflow actual y validando el SQL en BigQuery…
      </section>
    );
  }
  if (error) {
    return (
      <section className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-4 text-sm text-danger-800">
        No se pudo validar el Dataflow:{" "}
        {error instanceof Error ? error.message : "error de conexión"}
      </section>
    );
  }
  if (!preflight) {
    return (
      <section className="rounded-lg border border-line-200 bg-app px-4 py-5 text-sm text-ink-500">
        Selecciona un Dataflow para analizar su diseño.
      </section>
    );
  }
  if (!preflight.compatible) {
    return (
      <section className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-4">
        <p className="text-sm font-semibold text-warning-900">
          Dataflow no compatible todavía
        </p>
        <ul className="mt-2 space-y-1 text-sm text-warning-800">
          {preflight.operacionesNoSoportadas.map((operacion) => (
            <li key={operacion}>• {operacion}</li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            ✓
          </span>
          <p className="text-sm font-semibold text-emerald-900">
            Dataflow compatible
          </p>
        </div>
        <span className="font-mono text-xs text-emerald-800">
          SHA-256 {preflight.hashDataflowSha256.slice(0, 12)}…
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Metrica valor={preflight.resumen.fuentes} etiqueta="fuentes" />
        <Metrica valor={preflight.resumen.filtros} etiqueta="filtros" />
        <Metrica
          valor={preflight.resumen.joins}
          etiqueta="join"
          plural="joins"
        />
        <Metrica
          valor={preflight.resumen.camposSalida}
          etiqueta="campo"
          plural="campos"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-200 pt-3 text-xs text-emerald-900">
        <span>
          Dry-run: <strong>{formatearBytes(preflight.bytesProcesados)}</strong>{" "}
          · <strong>${preflight.costoEstimadoUsd.toFixed(6)} USD</strong>
        </span>
        <details className="max-w-full">
          <summary className="cursor-pointer font-semibold">
            Ver SQL generado
          </summary>
          <pre className="mt-2 max-h-56 max-w-3xl overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-100">
            {preflight.sqlBigQuery}
          </pre>
        </details>
      </div>
    </section>
  );
}

function Metrica({
  valor,
  etiqueta,
  plural,
}: {
  valor: number;
  etiqueta: string;
  plural?: string;
}) {
  return (
    <div className="rounded-md border border-emerald-100 bg-white/80 px-3 py-2">
      <p className="text-sm font-semibold text-ink-900">
        {valor} {valor === 1 ? etiqueta : (plural ?? `${etiqueta}s`)}
      </p>
    </div>
  );
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

import type { preflightDataflowReporte } from "../api";

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
  const bigQueryValidado = preflight.validacionBigQuery.exitosa;
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
      <div className="grid gap-3 border-t border-emerald-200 pt-4 sm:grid-cols-2">
        <MetricaCosto
          etiqueta="Datos a procesar"
          valor={
            bigQueryValidado
              ? formatearBytes(preflight.bytesProcesados)
              : "No disponible"
          }
          detalle={
            bigQueryValidado
              ? "Estimación del dry-run de BigQuery"
              : "BigQuery no pudo validar la consulta"
          }
        />
        <MetricaCosto
          etiqueta="Costo estimado"
          valor={
            bigQueryValidado
              ? formatearCostoUsd(preflight.costoEstimadoUsd)
              : "No disponible"
          }
          detalle={
            bigQueryValidado
              ? "Costo aproximado por ejecución"
              : "Sin estimación hasta corregir la validación"
          }
          destacado={bigQueryValidado && preflight.costoEstimadoUsd >= 1}
        />
      </div>
      {!bigQueryValidado ? (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
          <p className="font-semibold">No se pudo validar en BigQuery</p>
          <p className="mt-1 break-words">
            {preflight.validacionBigQuery.mensajeError ??
              "BigQuery no devolvió detalles del error"}
          </p>
          <p className="mt-2 text-xs">
            El SQL sí fue generado y puedes revisarlo abajo. La ejecución
            seguirá bloqueada hasta resolver esta validación.
          </p>
        </div>
      ) : preflight.costoEstimadoUsd >= 1 ? (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
          Esta ejecución podría procesar aproximadamente{" "}
          <strong>{formatearBytes(preflight.bytesProcesados)}</strong> y tener
          un costo aproximado de{" "}
          <strong>{formatearCostoUsd(preflight.costoEstimadoUsd)}</strong>.
        </div>
      ) : null}
      <details
        open
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-900">
          SQL generado
        </summary>
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(preflight.sqlBigQuery);
              }}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900"
            >
              Copiar SQL
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
            {preflight.sqlBigQuery}
          </pre>
        </div>
      </details>
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

function MetricaCosto({
  etiqueta,
  valor,
  detalle,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        destacado ? "border-warning-300" : "border-emerald-100"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {etiqueta}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-950">
        {valor}
      </p>
      <p className="mt-1 text-xs text-ink-500">{detalle}</p>
    </div>
  );
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function formatearCostoUsd(costo: number): string {
  if (costo > 0 && costo < 0.01) return "< $0.01 USD";
  return `$${costo.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

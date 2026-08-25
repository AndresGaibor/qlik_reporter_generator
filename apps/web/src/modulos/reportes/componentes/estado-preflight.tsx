import { Icon } from "@/compartido/componentes/ui/icon";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { useState } from "react";
import type { preflightDataflowReporte } from "../api";

const bigqueryStyle = {
  'pre[class*="language-"]': {
    background: "#ffffff",
    color: "#000000",
    fontFamily: "inherit",
  },
  'code[class*="language-"]': {
    background: "#ffffff",
    color: "#000000",
    fontFamily: "inherit",
  },
  comment: { color: "#6a9955" },
  prolog: { color: "#6a9955" },
  doctype: { color: "#6a9955" },
  cdata: { color: "#6a9955" },
  punctuation: { color: "#000000" },
  keyword: { color: "#569cd6" },
  "function.variable": { color: "#569cd6" },
  "template-string": { color: "#ce9178" },
  string: { color: "#ce9178" },
  boolean: { color: "#569cd6" },
  number: { color: "#b5cea8" },
  null: { color: "#569cd6" },
  "attr-name": { color: "#9cdcfe" },
  "class-name": { color: "#4ec9b0" },
  "maybe-unknown": { color: "#4ec9b0" },
  constant: { color: "#569cd6" },
  builtin: { color: "#dcdcaa" },
  variable: { color: "#9cdcfe" },
  function: { color: "#dcdcaa" },
  operator: { color: "#d4d4d4" },
  parameter: { color: "#9cdcfe" },
  "property-access": { color: "#9cdcfe" },
  indexer: { color: "#9cdcfe" },
  namespace: { color: "#9cdcfe" },
};

type Preflight = Awaited<ReturnType<typeof preflightDataflowReporte>>;

export function EstadoPreflight({
  validando,
  error,
  preflight,
  mostrarDetallesTecnicos = false,
}: {
  validando: boolean;
  error?: unknown;
  preflight?: Preflight;
  mostrarDetallesTecnicos?: boolean;
}) {
  if (validando) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface px-4 py-5 text-sm text-ink-500">
        Validando el reporte…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-4 text-sm text-danger-800">
        No se pudo validar el reporte.{" "}
        {error instanceof Error ? error.message : "Intenta nuevamente."}
      </div>
    );
  }

  if (!preflight) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface px-4 py-5 text-sm text-ink-500">
        No hay información de validación disponible.
      </div>
    );
  }

  if (!preflight.compatible) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
        <p className="text-sm font-semibold text-amber-900">
          Este reporte requiere revisión
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Hay pasos del Dataflow que todavía no pueden ejecutarse desde la
          plataforma.
        </p>
        {mostrarDetallesTecnicos && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {preflight.operacionesNoSoportadas.map((operacion) => (
              <li key={operacion}>{operacion}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const validado = preflight.validacionBigQuery.exitosa;

  return (
    <div className="space-y-4">
      {!mostrarDetallesTecnicos && validado && (
        <div className="flex items-center gap-2 text-sm font-medium text-brand-800">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-brand-700">
            ✓
          </span>
          Listo para ejecutar
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricaCosto
          etiqueta="Datos estimados"
          valor={
            validado
              ? formatearBytes(preflight.bytesProcesados)
              : "No disponible"
          }
          detalle={
            validado
              ? "Volumen aproximado a procesar"
              : "No fue posible calcular el volumen"
          }
        />
        <MetricaCosto
          etiqueta="Costo estimado"
          valor={
            validado
              ? formatearCostoUsd(preflight.costoEstimadoUsd)
              : "No disponible"
          }
          detalle={
            validado
              ? "Costo aproximado por ejecución"
              : "Sin estimación disponible"
          }
          destacado={validado && preflight.costoEstimadoUsd >= 1}
        />
      </div>

      {!validado && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
          <p className="font-semibold">No se pudo validar en BigQuery</p>
          <p className="mt-1 break-words">
            {preflight.validacionBigQuery.mensajeError ??
              "BigQuery no devolvió detalles del error"}
          </p>
        </div>
      )}

      {validado && preflight.costoEstimadoUsd >= 1 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta ejecución podría procesar aproximadamente{" "}
          <strong>{formatearBytes(preflight.bytesProcesados)}</strong> y tener
          un costo de{" "}
          <strong>{formatearCostoUsd(preflight.costoEstimadoUsd)}</strong>.
        </div>
      )}

      {mostrarDetallesTecnicos && <DetalleTecnico preflight={preflight} />}
    </div>
  );
}

function DetalleTecnico({ preflight }: { preflight: Preflight }) {
  const [sqlAbierto, setSqlAbierto] = useState(false);

  return (
    <div className="space-y-4 border-t border-line-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">
          Validación técnica
        </h3>
        <span className="font-mono text-xs text-ink-500">
          SHA-256 {preflight.hashDataflowSha256.slice(0, 12)}…
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Metrica valor={preflight.resumen.fuentes} etiqueta="fuente" />
        <Metrica valor={preflight.resumen.filtros} etiqueta="filtro" />
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
      <section className="overflow-hidden rounded-lg border border-line-200 bg-surface">
        <button
          type="button"
          aria-expanded={sqlAbierto}
          aria-controls="sql-generado"
          onClick={() => setSqlAbierto((abierto) => !abierto)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-ink-800 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
        >
          <Icon
            name="chev"
            size="sm"
            className={`text-ink-500 transition-transform ${sqlAbierto ? "rotate-90" : "-rotate-180"}`}
          />
          SQL generado
        </button>
        {sqlAbierto && (
          <div id="sql-generado" className="border-t border-line-200 bg-app/40 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
                <Icon name="file-text" size="sm" />
                GoogleSQL
              </span>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(preflight.sqlBigQuery)
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-line-200 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Icon name="copy" size="sm" />
                Copiar SQL
              </button>
            </div>
            <SyntaxHighlighter
              language="sql"
              style={bigqueryStyle}
              customStyle={{
                margin: 0,
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
                fontSize: "12px",
                lineHeight: "1.65",
                maxHeight: "24rem",
                overflow: "auto",
                padding: "1rem",
              }}
            >
              {preflight.sqlBigQuery}
            </SyntaxHighlighter>
          </div>
        )}
      </section>
    </div>
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
    <div className="rounded-md border border-line-200 bg-surface-subtle px-3 py-2">
      <p className="text-sm font-semibold text-ink-800">
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
      className={`rounded-lg border bg-surface px-4 py-3 ${destacado ? "border-amber-300" : "border-line-200"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {etiqueta}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-950">
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

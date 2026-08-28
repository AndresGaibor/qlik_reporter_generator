import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
import { useState } from "react";

export function ResumenAuditableReporte({
  resumen,
  cargando,
  error,
  onActualizar,
}: {
  resumen?: ResumenReporteDataflow;
  cargando: boolean;
  error?: unknown;
  onActualizar: () => void;
}) {
  const [mostrarFuentes, setMostrarFuentes] = useState(false);
  const [mostrarCampos, setMostrarCampos] = useState(false);

  if (cargando)
    return (
      <p className="rounded-lg border border-line-200 bg-surface p-5 text-sm text-ink-500">
        Cargando resumen…
      </p>
    );
  if (error || !resumen) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
        <p>No se pudo cargar el resumen del reporte.</p>
        <button
          type="button"
          className="mt-2 font-semibold underline"
          onClick={onActualizar}
        >
          Intentar nuevamente
        </button>
      </div>
    );
  }

  const fuentes =
    resumen.fuentes ??
    (resumen.fuentePrincipal
      ? [{ ...resumen.fuentePrincipal, principal: true }]
      : []);
  const condiciones = resumen.filtros.length;

  return (
    <section className="space-y-5 rounded-xl border border-line-200 bg-surface p-5 shadow-card sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">
          Qué contiene este reporte
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
          {resumen.descripcion ??
            "Contiene la información seleccionada del Dataflow para generar el reporte."}
        </p>
      </div>

      <div className="grid gap-4 border-t border-line-200 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Alcance de los datos
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">Periodo</p>
          <p className="mt-1 text-sm text-ink-600">
            {presentarPeriodo(resumen.rangoTemporal)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Contenido
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">
            {resumen.campos.length} campos incluidos
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {condiciones}{" "}
            {condiciones === 1 ? "condición aplicada" : "condiciones aplicadas"}
          </p>
        </div>
      </div>

      <div className="border-t border-line-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              Fuentes de información
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {fuentes.length}{" "}
              {fuentes.length === 1 ? "fuente" : "fuentes combinadas"}
            </p>
            {fuentes[0] && (
              <p className="mt-1 text-sm text-ink-600">
                Principal: <strong>{fuentes[0].nombre}</strong>
              </p>
            )}
          </div>
          {fuentes.length > 0 && (
            <button
              type="button"
              className="text-sm font-semibold text-brand-700 hover:text-brand-900"
              onClick={() => setMostrarFuentes((visible) => !visible)}
            >
              {mostrarFuentes ? "Ocultar fuentes" : "Ver fuentes"}
            </button>
          )}
        </div>
        {mostrarFuentes && (
          <ol className="mt-3 space-y-2 border-t border-line-200 pt-3 text-sm text-ink-700">
            {fuentes.map((fuente, indice) => (
              <li key={`${fuente.tabla}-${indice}`}>
                <strong>
                  {indice + 1}. {fuente.nombre}
                </strong>
                {fuente.dataset && (
                  <span className="ml-2 text-ink-500">
                    · Dataset: {fuente.dataset}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-line-200 pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-900">
            Campos incluidos{" "}
            <span className="ml-2 text-ink-500">{resumen.campos.length}</span>
          </h3>
          <button
            type="button"
            className="text-sm font-semibold text-brand-700 hover:text-brand-900"
            onClick={() => setMostrarCampos((visible) => !visible)}
          >
            {mostrarCampos
              ? "Ocultar campos"
              : `Ver los ${resumen.campos.length} campos`}
          </button>
        </div>
        {!mostrarCampos && (
          <p className="mt-3 truncate text-sm text-ink-500">
            {resumen.campos.map((campo) => campo.nombreVisible).join(" · ")}
          </p>
        )}
        {mostrarCampos && (
          <ol className="mt-3 grid gap-2 border-t border-line-200 pt-3 text-sm text-ink-700 sm:grid-cols-2">
            {resumen.campos.map((campo, indice) => (
              <li key={`${campo.alias}-${indice}`}>
                <span className="mr-2 text-ink-400">{indice + 1}.</span>
                {campo.nombreVisible}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function presentarPeriodo(
  rango?: ResumenReporteDataflow["rangoTemporal"],
): string {
  if (!rango?.fechaInicial && !rango?.fechaFinal)
    return "Según los parámetros seleccionados";
  if (rango.fechaInicial && rango.fechaFinal)
    return `${rango.fechaInicial} al ${rango.fechaFinal}`;
  return (
    rango.fechaInicial ??
    rango.fechaFinal ??
    "Según los parámetros seleccionados"
  );
}

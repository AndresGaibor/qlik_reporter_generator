import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
import type { ReactNode } from "react";

export function PestanaScriptFlujo({
  resumen,
  cargando,
  error,
  actualizando,
  onActualizar,
}: {
  resumen?: ResumenReporteDataflow;
  cargando: boolean;
  error?: unknown;
  actualizando: boolean;
  onActualizar: () => void;
}) {
  if (cargando) return <EstadoCargando />;
  if (error || !resumen)
    return <EstadoError error={error} onActualizar={onActualizar} />;

  const estado = textosEstado[resumen.estado];
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Resumen del reporte
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink-900">
              {resumen.nombre}
            </h2>
            {resumen.descripcion && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
                {resumen.descripcion}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={actualizando}
            onClick={onActualizar}
            className="gap-2"
          >
            <Icon name="sparkles" size="sm" />
            {actualizando ? "Actualizando..." : "Actualizar resumen"}
          </Button>
        </div>

        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${estado.clases}`}
        >
          <p className="font-semibold">{estado.titulo}</p>
          <p className="mt-0.5">{estado.descripcion}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Dato titulo="Fuente principal" valor={resumen.fuentePrincipal?.nombre}>
          {resumen.fuentePrincipal?.dataset && (
            <span>Dataset: {resumen.fuentePrincipal.dataset}</span>
          )}
        </Dato>
        <Dato titulo="Tabla de resultado" valor={resumen.tablaDestino} />
      </section>

      {resumen.rangoTemporal && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold text-blue-950">
            Rango temporal detectado
          </h2>
          <p className="mt-2 text-sm text-blue-900">
            Campo <strong>{resumen.rangoTemporal.campo}</strong>: desde{" "}
            <strong>
              {resumen.rangoTemporal.fechaInicial ?? "un valor por completar"}
            </strong>{" "}
            hasta{" "}
            <strong>
              {resumen.rangoTemporal.fechaFinal ?? "un valor por completar"}
            </strong>
            .
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">Campos devueltos</h2>
        {resumen.campos.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-3 py-2">Nombre visible</th>
                  <th className="px-3 py-2">Alias</th>
                  <th className="px-3 py-2">Tipo detectado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumen.campos.map((campo) => (
                  <tr key={campo.alias}>
                    <td className="px-3 py-2 font-medium text-ink-900">
                      {campo.nombreVisible}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-600">
                      {campo.alias}
                    </td>
                    <td className="px-3 py-2 text-ink-600">
                      {campo.tipoInferido
                        ? humanizarTipo(campo.tipoInferido)
                        : "No determinado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            No se detectaron campos de salida.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">
          Filtros y parámetros
        </h2>
        {resumen.filtros.length > 0 ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {resumen.filtros.map((filtro, indice) => (
              <div
                key={`${filtro.campo}-${filtro.operador}-${indice}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">
                    {filtro.etiqueta}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${filtro.obligatorio ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}
                  >
                    {filtro.obligatorio
                      ? "Debes completar este valor"
                      : "Valor definido"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink-700">
                  {describirFiltro(filtro)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            No se detectaron filtros ni parámetros en el reporte.
          </p>
        )}
      </section>

      {resumen.advertencias.length > 0 && (
        <section className="rounded-xl border border-warning-200 bg-warning-50 p-5">
          <h2 className="text-sm font-semibold text-warning-900">
            {resumen.estado === "script_no_compatible"
              ? "Qué debes hacer"
              : "Aspectos a revisar"}
          </h2>
          <div className="mt-3 space-y-2">
            {resumen.advertencias.map((advertencia, indice) => (
              <div
                key={advertencia}
                className="flex gap-3 rounded-lg border border-warning-200 bg-white/70 px-4 py-3 text-sm text-warning-900"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warning-100 text-xs font-bold text-warning-800">
                  {indice + 1}
                </span>
                <p className="leading-6">{advertencia}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EstadoCargando() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border bg-white p-8">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p className="text-sm font-medium text-ink-500">
        Analizando el reporte actual...
      </p>
    </div>
  );
}

function EstadoError({
  error,
  onActualizar,
}: { error: unknown; onActualizar: () => void }) {
  return (
    <section className="rounded-xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-800">
      <p className="font-semibold">
        No se pudo obtener el resumen del reporte.
      </p>
      <p className="mt-1">
        {error instanceof Error ? error.message : "Error de conexión"}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onActualizar}
        className="mt-3"
      >
        Reintentar
      </Button>
    </section>
  );
}

function Dato({
  titulo,
  valor,
  children,
}: { titulo: string; valor?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {titulo}
      </p>
      <p className="mt-1 text-base font-semibold text-ink-900">
        {valor ?? "No determinado"}
      </p>
      {children && <p className="mt-1 text-xs text-ink-500">{children}</p>}
    </div>
  );
}

const textosEstado = {
  analizado: {
    titulo: "Analizado correctamente",
    descripcion: "El script fue validado y el resumen está actualizado.",
    clases: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  script_no_compatible: {
    titulo: "Script no compatible",
    descripcion:
      "Se recuperó información útil, pero hay fragmentos que requieren revisión.",
    clases: "border-warning-200 bg-warning-50 text-warning-900",
  },
  sin_filtros: {
    titulo: "No se detectaron filtros",
    descripcion:
      "El reporte fue analizado correctamente, pero no contiene filtros reconocibles.",
    clases: "border-blue-200 bg-blue-50 text-blue-900",
  },
  script_no_disponible: {
    titulo: "No se pudo obtener el script",
    descripcion: "Qlik Cloud no devolvió el script actual del Dataflow.",
    clases: "border-danger-200 bg-danger-50 text-danger-900",
  },
} as const;

function humanizarTipo(tipo: string) {
  return tipo === "fecha_hora"
    ? "Fecha y hora"
    : tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

function describirFiltro(
  filtro: ResumenReporteDataflow["filtros"][number],
): string {
  const valor = filtro.valorPredeterminado ?? "el valor que indiques";
  const condiciones: Record<string, string> = {
    "=": "sea igual a",
    "!=": "sea diferente de",
    "<>": "sea diferente de",
    ">": "sea mayor o posterior a",
    ">=": "sea igual o posterior a",
    "<": "sea menor o anterior a",
    "<=": "sea igual o anterior a",
    LIKE: "coincida con",
  };
  return `El reporte incluirá registros donde ${filtro.campo} ${
    condiciones[filtro.operador] ?? "cumpla la condición con"
  } ${valor}.`;
}

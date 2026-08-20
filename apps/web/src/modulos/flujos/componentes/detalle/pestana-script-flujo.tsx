import { Button } from "@/compartido/componentes/ui/button";
import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";

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

  const necesitaAviso = resumen.estado !== "analizado";

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line-200 bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-400">
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
          >
            {actualizando ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>

        {necesitaAviso && <AvisoEstado resumen={resumen} />}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Dato
            titulo="Origen de datos"
            valor={resumen.fuentePrincipal?.nombre}
          >
            {resumen.fuentePrincipal?.dataset && (
              <span>Dataset {resumen.fuentePrincipal.dataset}</span>
            )}
          </Dato>
          <Dato
            titulo="Contenido"
            valor={`${resumen.campos.length} ${resumen.campos.length === 1 ? "campo incluido" : "campos incluidos"} · ${resumen.filtros.length} ${resumen.filtros.length === 1 ? "filtro" : "filtros"}`}
          />
        </div>
      </section>

      {resumen.rangoTemporal && (
        <section className="rounded-lg border border-line-200 bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
            Periodo
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-800">
            {describirRangoTemporal(resumen.rangoTemporal)}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-line-200 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-900">
            Campos incluidos
          </h2>
          <span className="text-xs text-ink-400">{resumen.campos.length}</span>
        </div>
        {resumen.campos.length > 0 ? (
          <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {resumen.campos.map((campo) => (
              <div
                key={campo.alias}
                className="border-b border-line-200 py-2 text-sm font-medium text-ink-800"
              >
                {campo.nombreVisible}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            No se detectaron campos de salida.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line-200 bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink-900">Filtros</h2>
        {resumen.filtros.length > 0 ? (
          <div className="mt-3 divide-y divide-line-200 rounded-lg border border-line-200">
            {resumen.filtros.map((filtro, indice) => (
              <div
                key={`${filtro.campo}-${filtro.operador}-${indice}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-semibold text-ink-800">
                  {filtro.etiqueta}
                </span>
                <span className="text-sm text-ink-600">
                  {describirFiltroCompacto(filtro)}
                </span>
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
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            {resumen.estado === "script_no_compatible"
              ? "Qué debes hacer"
              : "Aspectos a revisar"}
          </h2>
          <div className="mt-3 space-y-2">
            {resumen.advertencias.map((advertencia) => (
              <p key={advertencia} className="text-sm leading-6 text-amber-900">
                {advertencia}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AvisoEstado({ resumen }: { resumen: ResumenReporteDataflow }) {
  if (resumen.estado === "sin_filtros") {
    return (
      <div className="mt-4 rounded-md border border-line-200 bg-surface-subtle px-4 py-3 text-sm text-ink-700">
        <p className="font-semibold">No se detectaron filtros</p>
        <p className="mt-0.5 text-ink-500">
          El reporte puede ejecutarse, pero no contiene filtros reconocibles.
        </p>
      </div>
    );
  }
  if (resumen.estado === "script_no_compatible") {
    return (
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">El reporte requiere revisión</p>
        <p className="mt-0.5">
          Hay pasos del diseño que todavía no son compatibles.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
      <p className="font-semibold">No se pudo obtener el diseño actual</p>
      <p className="mt-0.5">Qlik Cloud no devolvió la información necesaria.</p>
    </div>
  );
}

function EstadoCargando() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-line-200 bg-surface p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p className="text-sm font-medium text-ink-500">
        Analizando el reporte actual…
      </p>
    </div>
  );
}

function EstadoError({
  error,
  onActualizar,
}: {
  error: unknown;
  onActualizar: () => void;
}) {
  return (
    <section className="rounded-lg border border-danger-200 bg-danger-50 p-5 text-sm text-danger-800">
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
}: {
  titulo: string;
  valor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line-200 bg-surface-subtle px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {titulo}
      </p>
      <p className="mt-1 text-base font-semibold text-ink-900">
        {valor ?? "No disponible"}
      </p>
      {children && <p className="mt-1 text-xs text-ink-500">{children}</p>}
    </div>
  );
}

function describirRangoTemporal(
  rango: NonNullable<ResumenReporteDataflow["rangoTemporal"]>,
) {
  const inicio = formatearFechaValor(rango.fechaInicial);
  const fin = formatearFechaValor(rango.fechaFinal);
  if (inicio && fin && inicio === fin) return `${rango.campo}: ${inicio}`;
  if (inicio && fin) return `${rango.campo}: ${inicio} — ${fin}`;
  if (inicio) return `${rango.campo}: desde ${inicio}`;
  if (fin) return `${rango.campo}: hasta ${fin}`;
  return `${rango.campo}: valor pendiente`;
}

function describirFiltroCompacto(
  filtro: ResumenReporteDataflow["filtros"][number],
) {
  if (!filtro.valorPredeterminado)
    return filtro.obligatorio ? "Valor requerido" : "Sin valor definido";
  const valor =
    formatearFechaValor(filtro.valorPredeterminado) ??
    filtro.valorPredeterminado;
  const operadores: Record<string, string> = {
    "=": "=",
    "!=": "≠",
    "<>": "≠",
    ">": ">",
    ">=": "≥",
    "<": "<",
    "<=": "≤",
    LIKE: "coincide con",
  };
  return `${operadores[filtro.operador] ?? filtro.operador} ${valor}`;
}

function formatearFechaValor(valor: string | null | undefined) {
  if (!valor) return null;
  let year: number;
  let month: number;
  let day: number;

  let match = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  const fecha = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(fecha)
    .replace(/\./g, "");
}

import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Card, CardContent } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import { extraerMensajeError } from "@/modulos/reportes/utiles-presentacion-reporte";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  crearAutomatizacionDesdePlantilla,
  preflightDataflowReporte,
} from "./api";

const DESTINO_GCS = "gs://bkt_dwh/POCs/TalendDescargados/";

export function PaginaNuevaAutomatizacion() {
  return <FormularioDataflow />;
}

function FormularioDataflow() {
  const { mostrarExito, mostrarError } = useNotificaciones();
  const parametros = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [nombre, setNombre] = useState("");
  const [flujoId, setFlujoId] = useState(parametros.get("flujoId") ?? "");
  const [programar, setProgramar] = useState(false);
  const [cron, setCron] = useState("0 8 * * *");
  const [zonaHoraria, setZonaHoraria] = useState("America/Guayaquil");
  const [guardando, setGuardando] = useState(false);

  const {
    data: flujos = [],
    isLoading: cargandoFlujos,
    isError: errorFlujos,
    error: errorFlujosDetalle,
  } = useQuery({
    queryKey: ["flujos-reportes"],
    queryFn: () =>
      obtenerFlujosConFiltros(parametros.get("espacioId") ?? undefined),
  });

  useEffect(() => {
    if (!flujoId && flujos[0]) setFlujoId(flujos[0].id);
  }, [flujoId, flujos]);

  const flujo = flujos.find((item) => item.id === flujoId);
  const {
    data: preflight,
    isLoading: validando,
    isError: errorPreflight,
    error: errorPreflightDetalle,
  } = useQuery({
    queryKey: ["preflight-dataflow-reporte", flujoId],
    queryFn: () => preflightDataflowReporte(flujoId),
    enabled: Boolean(flujoId),
  });

  const nombreFinal = nombre.trim() || `Reporte ${flujo?.nombre ?? "Dataflow"}`;
  const puedeCrear =
    Boolean(flujoId) &&
    preflight?.compatible === true &&
    (!programar || cron.trim().length >= 9) &&
    !guardando;

  async function crearReporte() {
    if (!flujo || !preflight?.compatible) return;
    setGuardando(true);
    try {
      const resultado = await crearAutomatizacionDesdePlantilla({
        nombre: nombreFinal,
        flujoId: flujo.id,
        ...(flujo.espacioId ? { espacioIdQlik: flujo.espacioId } : {}),
        reemplazosWorkspace: [],
        ...(programar
          ? {
              programacion: {
                activa: true,
                expresionCron: cron.trim(),
                zonaHoraria,
              },
            }
          : {}),
      });
      mostrarExito("Reporte creado y asociado al Dataflow actual");
      window.location.href = `/reportes/${resultado.id}`;
    } catch (error) {
      mostrarError(
        error instanceof Error ? error.message : "No se pudo crear el reporte",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-4">
      <Link
        to="/reportes"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <Icon name="chev" size="sm" className="rotate-180" />
        Volver a reportes
      </Link>

      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
          Crear reporte
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Selecciona el Dataflow de Qlik que define los datos del reporte. La
          plataforma leerá siempre su versión actual antes de ejecutar.
        </p>
      </header>

      <Card className="border-line-200 bg-surface shadow-card">
        <CardContent className="space-y-6 p-5 sm:p-6">
          <section className="space-y-2">
            <label
              htmlFor="nombre-reporte"
              className="block text-sm font-semibold text-ink-900"
            >
              Nombre del reporte
            </label>
            <input
              id="nombre-reporte"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              placeholder={nombreFinal}
              className="h-11 w-full rounded-md border border-line-200 bg-surface px-3.5 text-sm font-medium text-ink-900 shadow-card outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
          </section>

          <section className="space-y-2">
            <label
              htmlFor="dataflow-reporte"
              className="block text-sm font-semibold text-ink-900"
            >
              Dataflow de Qlik
            </label>
            <select
              id="dataflow-reporte"
              value={flujoId}
              onChange={(evento) => setFlujoId(evento.target.value)}
              disabled={cargandoFlujos || flujos.length === 0}
              className="h-11 w-full rounded-md border border-line-200 bg-surface px-3.5 text-sm font-medium text-ink-900 shadow-card outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
            >
              <option value="">
                {cargandoFlujos
                  ? "Cargando Dataflows…"
                  : "Selecciona un Dataflow"}
              </option>
              {flujos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} · {item.espacioNombre}
                </option>
              ))}
            </select>
            {errorFlujos ? (
              <p className="text-sm text-danger-700">
                {extraerMensajeError(errorFlujosDetalle) ??
                  "No se pudieron cargar los Dataflows de Qlik."}
              </p>
            ) : null}
          </section>

          <EstadoPreflight
            validando={validando}
            error={errorPreflight ? errorPreflightDetalle : undefined}
            preflight={preflight}
          />

          <section className="rounded-lg border border-line-200 bg-app px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  Programación
                </h2>
                <p className="mt-1 text-xs text-ink-500">
                  Las ejecuciones programadas también releen el Dataflow antes
                  de iniciar Talend.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
                <input
                  id="programar-reporte"
                  type="checkbox"
                  checked={programar}
                  onChange={(evento) => setProgramar(evento.target.checked)}
                  className="h-4 w-4 accent-[var(--color-brand-600)]"
                />
                Activar
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="cron-reporte"
                  className="text-xs font-semibold text-ink-600"
                >
                  Expresión cron
                </label>
                <input
                  id="cron-reporte"
                  value={cron}
                  disabled={!programar}
                  onChange={(evento) => setCron(evento.target.value)}
                  className="h-10 w-full rounded-md border border-line-200 bg-surface px-3 font-mono text-sm text-ink-900 outline-none focus:border-brand-600 disabled:bg-slate-100 disabled:text-ink-400"
                />
                <p className="text-[11px] text-ink-400">
                  Ejemplo: 0 8 * * * = todos los días a las 08:00.
                </p>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="zona-reporte"
                  className="text-xs font-semibold text-ink-600"
                >
                  Zona horaria
                </label>
                <select
                  id="zona-reporte"
                  value={zonaHoraria}
                  disabled={!programar}
                  onChange={(evento) => setZonaHoraria(evento.target.value)}
                  className="h-10 w-full rounded-md border border-line-200 bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand-600 disabled:bg-slate-100 disabled:text-ink-400"
                >
                  <option value="America/Guayaquil">America/Guayaquil</option>
                  <option value="America/Bogota">America/Bogota</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line-200 bg-surface px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
              Destino fijo
            </p>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-ink-900">
              {DESTINO_GCS}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              CSV comprimido con GZIP · máximo 1.000.000 filas por bloque
              lógico.
            </p>
          </section>

          <div className="flex items-center justify-end gap-3 border-t border-line-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!puedeCrear}
              onClick={crearReporte}
              className="min-w-44 gap-2 bg-brand-600 text-white hover:bg-brand-700"
            >
              <Icon name="file-text" size="sm" />
              {guardando ? "Creando…" : "Crear reporte"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EstadoPreflight({
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

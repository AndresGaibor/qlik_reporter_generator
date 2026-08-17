import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Card, CardContent } from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import { EstadoPreflight } from "@/modulos/reportes/componentes/estado-preflight";
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
    Boolean(flujoId) && preflight?.compatible === true && !guardando;

  async function crearReporte() {
    if (!flujo || !preflight?.compatible) return;
    setGuardando(true);
    try {
      const resultado = await crearAutomatizacionDesdePlantilla({
        nombre: nombreFinal,
        flujoId: flujo.id,
        ...(flujo.espacioId ? { espacioIdQlik: flujo.espacioId } : {}),
        reemplazosWorkspace: [],
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

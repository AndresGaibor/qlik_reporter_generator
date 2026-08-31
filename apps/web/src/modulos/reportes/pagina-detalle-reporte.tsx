import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { construirUrlVerFlujoQlik } from "@/compartido/utiles/qlik-urls";
import { PestanaMetadataFlujo } from "@/modulos/flujos/componentes/detalle/pestana-metadata-flujo";
import {
  cancelarEjecucionReporte,
  ejecutarReporte,
  obtenerEjecucionesReporte,
  obtenerReporte,
  obtenerResumenReporte,
  obtenerVistaPreviaReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { EstadoEjecucionEnVivo } from "@/modulos/reportes/componentes/detalle/estado-ejecucion-en-vivo";
import { HistorialAuditoriaReporte } from "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte";
import { ResumenAuditableReporte } from "@/modulos/reportes/componentes/detalle/resumen-auditable-reporte";
import { VistaPreviaReporte } from "@/modulos/reportes/componentes/detalle/vista-previa-reporte";
import { EstadoPreflight } from "@/modulos/reportes/componentes/estado-preflight";
import { ModalConfirmacionRiesgo } from "@/modulos/reportes/componentes/modal-confirmacion-riesgo";
import { hashRiesgoDevuelto } from "@/modulos/reportes/utiles-riesgo-ejecucion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type Pestana = "resumen" | "tecnico" | "historial";

const PESTANAS_VALIDAS: ReadonlySet<string> = new Set([
  "resumen",
  "tecnico",
  "historial",
]);

function leerHashPestana(): Pestana {
  const hash = window.location.hash.replace("#", "");
  return PESTANAS_VALIDAS.has(hash) ? (hash as Pestana) : "resumen";
}

export function PaginaDetalleReporte({ id }: { id: string }) {
  const { tenant: tenantActivo } = useTenantActivo();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const client = useQueryClient();
  const navegar = useNavigate();
  const [pestana, setPestana] = useState<Pestana>(leerHashPestana);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [hashRiesgoPendiente, setHashRiesgoPendiente] = useState<string | null>(
    null,
  );
  const [mostrarConfirmacionCancelacion, setMostrarConfirmacionCancelacion] =
    useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const referenciasTabs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!mostrarConfirmacion) return;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMostrarConfirmacion(false);
    };
    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [mostrarConfirmacion]);

  useEffect(() => {
    function onHashChange() {
      setPestana(leerHashPestana());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const reporte = useQuery({
    queryKey: ["reporte", tenantActivo?.id, id],
    queryFn: () => obtenerReporte(id),
    retry: false,
  });
  const resumen = useQuery({
    queryKey: ["resumen-reporte", tenantActivo?.id, id],
    queryFn: () => obtenerResumenReporte(id),
    retry: false,
  });
  const preflight = useQuery({
    queryKey: ["preflight-reporte", tenantActivo?.id, id],
    queryFn: () => preflightDataflowReporte(id),
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["reportes", id, "preview"],
    queryFn: () => obtenerVistaPreviaReporte(id),
    retry: false,
    enabled: mostrarPreview,
  });
  const ejecuciones = useQuery({
    queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
    queryFn: () => obtenerEjecucionesReporte(id),
    retry: false,
    refetchInterval: (consulta) =>
      consulta.state.data?.some(
        (ejecucion) =>
          ejecucion.estado === "preparando" ||
          ejecucion.estado === "iniciada" ||
          ejecucion.estado === "cancelando",
      )
        ? 2_000
        : false,
  });

  const cancelar = useMutation({
    mutationFn: (ejecucionId: string) =>
      cancelarEjecucionReporte(id, ejecucionId),
    onSuccess: () => {
      setMostrarConfirmacionCancelacion(false);
      void client.invalidateQueries({
        queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
      });
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const ejecutar = useMutation({
    mutationFn: (confirmacionRiesgo?: { hashDataflowSha256: string }) =>
      ejecutarReporte(id, confirmacionRiesgo),
    onSuccess: (resultado) => {
      setHashRiesgoPendiente(null);
      mostrarExito("Reporte enviado a procesamiento");
      void client.invalidateQueries({
        queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
      });
      void navegar({
        to: "/descargas",
        search: { carpeta: resultado.carpetaDescargas },
      });
    },
    onError: (error: Error) => {
      const hash = hashRiesgoDevuelto(error);
      if (hash) setHashRiesgoPendiente(hash);
      else mostrarError(error.message);
    },
  });

  if (reporte.isLoading)
    return <p className="p-8 text-ink-500">Cargando reporte…</p>;
  if (reporte.isError || !reporte.data) {
    return (
      <EstadoError
        mensaje={reporte.error?.message ?? "No se pudo cargar el reporte"}
        onReintentar={() => void reporte.refetch()}
      />
    );
  }

  const dataflow = reporte.data;
  const ejecucionesActuales = ejecuciones.data ?? [];
  const ejecucionActiva = ejecucionesActuales.find(
    (item) =>
      item.estado === "preparando" ||
      item.estado === "iniciada" ||
      item.estado === "cancelando",
  );
  const procesando = Boolean(ejecucionActiva);
  const urlQlik = tenantActivo?.host
    ? construirUrlVerFlujoQlik(tenantActivo.host, id, dataflow.espacioId ?? "")
    : null;
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      await Promise.all([
        reporte.refetch(),
        resumen.refetch(),
        preflight.refetch(),
        ejecuciones.refetch(),
        ...(mostrarPreview ? [preview.refetch()] : []),
      ]);
      mostrarExito("Reporte sincronizado con Qlik");
    } finally {
      setSincronizando(false);
    }
  };
  const flujo = {
    id,
    nombre: dataflow.nombre,
    espacioId: dataflow.espacioId ?? undefined,
    espacioNombre: dataflow.espacioNombre ?? "Personal",
    modificadoEn: dataflow.modificadoEn ?? undefined,
  };

  return (
    <PageLayout>
      <Link
        to="/reportes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <Icon name="chev" size="sm" className="rotate-180" />
        Reportes
      </Link>

      <PageHeader
        title={dataflow.nombre}
        description={`Espacio: ${dataflow.espacioNombre ?? "Personal"}${procesando ? " · ⟳ Reporte en procesamiento" : ejecucionesActuales[0] ? ` · Última ejecución: ${formatearFechaCorta(ejecucionesActuales[0].creadoEn)} · ${ejecucionesActuales[0].estado === "completada" ? "Completada" : ejecucionesActuales[0].estado}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={sincronizando}
              onClick={() => void sincronizar()}
            >
              {sincronizando ? "Sincronizando…" : "Sincronizar con Qlik"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navegar({
                  to: "/descargas",
                  search: { carpeta: dataflow.carpetaDescargas },
                })
              }
            >
              <Icon name="download" size="sm" /> Ver descargas
            </Button>
            {urlQlik && (
              <Button asChild variant="outline" size="sm">
                <a href={urlQlik} target="_blank" rel="noopener noreferrer">
                  <Icon name="ext" size="sm" /> Ver en Qlik Cloud
                </a>
              </Button>
            )}
            <Button
              size="sm"
              disabled={ejecutar.isPending || procesando}
              onClick={() => setMostrarConfirmacion(true)}
            >
              <Icon name="play" size="sm" />
              {procesando
                ? "Procesando…"
                : ejecutar.isPending
                  ? "Iniciando…"
                  : "Ejecutar reporte"}
            </Button>
          </div>
        }
      />

      <div
        role="tablist"
        aria-label="Secciones del reporte"
        className="flex w-fit gap-1 border-b border-line-200 text-sm"
      >
        {(
          [
            ["resumen", "Resumen"],
            ["historial", "Auditoría de ejecuciones"],
            ["tecnico", "Evidencia técnica"],
          ] as const
        ).map(([key, label], indice) => (
          <button
            key={key}
            ref={(element) => {
              referenciasTabs.current[indice] = element;
            }}
            id={`tab-${key}`}
            role="tab"
            aria-selected={pestana === key}
            aria-controls={`panel-${key}`}
            tabIndex={pestana === key ? 0 : -1}
            type="button"
            onKeyDown={(evento) => {
              if (
                !["ArrowRight", "ArrowLeft", "Home", "End"].includes(evento.key)
              )
                return;
              evento.preventDefault();
              const siguiente =
                evento.key === "Home"
                  ? 0
                  : evento.key === "End"
                    ? 2
                    : (indice + (evento.key === "ArrowRight" ? 1 : -1) + 3) % 3;
              const siguienteKey = (
                ["resumen", "historial", "tecnico"] as const
              )[siguiente];
              setPestana(siguienteKey);
              window.location.hash = siguienteKey;
              referenciasTabs.current[siguiente]?.focus();
            }}
            onClick={() => {
              setPestana(key);
              window.location.hash = key;
            }}
            className={`border-b-2 px-3 py-2 font-semibold transition-colors ${
              pestana === key
                ? "border-brand-600 text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {ejecucionActiva && (
        <EstadoEjecucionEnVivo
          ejecucion={ejecucionActiva}
          cancelando={cancelar.isPending}
          onCancelar={() => setMostrarConfirmacionCancelacion(true)}
        />
      )}

      {mostrarConfirmacionCancelacion && ejecucionActiva && (
        <dialog open className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-ink-900">
            ¿Cancelar esta ejecución?
          </h2>
          <p className="mt-2 text-sm text-ink-700">
            Se marcará la ejecución como cancelando y se solicitará cancelar el
            trabajo de BigQuery. Talend podría continuar brevemente; podrían
            existir archivos incompletos.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setMostrarConfirmacionCancelacion(false)}
            >
              Seguir esperando
            </Button>
            <Button onClick={() => cancelar.mutate(ejecucionActiva.id)}>
              Sí, cancelar ejecución
            </Button>
          </div>
        </dialog>
      )}

      {pestana === "resumen" && (
        <div
          id="panel-resumen"
          role="tabpanel"
          aria-labelledby="tab-resumen"
          className="space-y-5"
        >
          <ResumenAuditableReporte
            resumen={resumen.data}
            cargando={resumen.isLoading}
            error={resumen.error}
            onActualizar={() => void resumen.refetch()}
          />
          {!mostrarPreview ? (
            <div className="rounded-lg border border-line-200 bg-surface p-5 text-center">
              <Button size="sm" onClick={() => setMostrarPreview(true)}>
                <Icon name="rows" size="sm" /> Vista previa
              </Button>
            </div>
          ) : preview.data !== undefined ? (
            <VistaPreviaReporte
              datos={preview.data}
              cargando={preview.isLoading}
              error={preview.error}
            />
          ) : preview.isLoading ? (
            <VistaPreviaReporte
              datos={undefined}
              cargando={preview.isLoading}
              error={preview.error}
            />
          ) : null}
          <section className="rounded-lg border border-line-200 bg-surface p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-ink-900">
                Estimación de ejecución
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Valores aproximados antes de iniciar el procesamiento.
              </p>
            </div>
            <EstadoPreflight
              preflight={preflight.data}
              validando={preflight.isLoading}
              error={preflight.error}
            />
          </section>
        </div>
      )}

      {pestana === "tecnico" && (
        <div
          id="panel-tecnico"
          role="tabpanel"
          aria-labelledby="tab-tecnico"
          className="space-y-5"
        >
          <section className="rounded-lg border border-line-200 bg-blue-50/60 p-4 text-sm text-ink-600">
            Información de trazabilidad para soporte, auditoría avanzada y
            validación técnica. No es necesaria para consultar o ejecutar el
            reporte.
          </section>
          <PestanaMetadataFlujo flujo={flujo} />
          <section className="rounded-lg border border-line-200 bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">
              Evidencia técnica
            </h2>
            <EstadoPreflight
              preflight={preflight.data}
              validando={preflight.isLoading}
              error={preflight.error}
              mostrarDetallesTecnicos
            />
          </section>
        </div>
      )}

      {pestana === "historial" && (
        <div
          id="panel-historial"
          role="tabpanel"
          aria-labelledby="tab-historial"
        >
          {ejecuciones.isError ? (
            <EstadoError
              mensaje="No se pudo cargar la auditoría de ejecuciones. Intenta nuevamente."
              onReintentar={() => void ejecuciones.refetch()}
            />
          ) : (
            <HistorialAuditoriaReporte
              ejecuciones={ejecucionesActuales}
              hashConfiguracionActual={preflight.data?.hashDataflowSha256}
              id={id}
            />
          )}
        </div>
      )}

      {mostrarConfirmacion && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
          role="presentation"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget)
              setMostrarConfirmacion(false);
          }}
        >
          <dialog
            open
            aria-labelledby="confirmar-ejecucion"
            className="w-full max-w-md rounded-xl border border-line-200 bg-surface p-6 shadow-xl"
          >
            <h2
              id="confirmar-ejecucion"
              className="text-lg font-semibold text-ink-900"
            >
              Ejecutar {dataflow.nombre}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500">Periodo</dt>
                <dd className="font-semibold text-ink-800">
                  {resumen.data?.rangoTemporal?.fechaInicial ??
                    "Según selección"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Contenido</dt>
                <dd className="font-semibold text-ink-800">
                  {resumen.data?.campos.length ?? "—"} campos
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Volumen estimado</dt>
                <dd className="font-semibold text-ink-800">
                  {preflight.data?.validacionBigQuery.exitosa
                    ? `${(preflight.data.bytesProcesados / 1_000_000_000).toFixed(1)} GB`
                    : "No disponible"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Costo estimado</dt>
                <dd className="font-semibold text-ink-800">
                  {preflight.data?.validacionBigQuery.exitosa
                    ? `$${preflight.data.costoEstimadoUsd.toFixed(2)} USD`
                    : "No disponible"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-ink-600">
              Los archivos generados se guardarán en tu carpeta privada.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMostrarConfirmacion(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={ejecutar.isPending}
                onClick={() => {
                  setMostrarConfirmacion(false);
                  ejecutar.mutate(undefined);
                }}
              >
                {ejecutar.isPending ? "Iniciando…" : "Ejecutar reporte"}
              </Button>
            </div>
          </dialog>
        </div>
      )}
      <ModalConfirmacionRiesgo
        abierto={hashRiesgoPendiente !== null}
        onVolver={() => setHashRiesgoPendiente(null)}
        onConfirmar={() => {
          if (hashRiesgoPendiente)
            ejecutar.mutate({ hashDataflowSha256: hashRiesgoPendiente });
        }}
      />
    </PageLayout>
  );
}

function formatearFechaCorta(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);
}

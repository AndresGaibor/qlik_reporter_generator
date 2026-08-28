import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { construirUrlVerFlujoQlik } from "@/compartido/utiles/qlik-urls";
import { PestanaMetadataFlujo } from "@/modulos/flujos/componentes/detalle/pestana-metadata-flujo";
import { PestanaScriptFlujo } from "@/modulos/flujos/componentes/detalle/pestana-script-flujo";
import {
  ejecutarReporte,
  obtenerEjecucionesReporte,
  obtenerReporte,
  obtenerResumenReporte,
  obtenerVistaPreviaReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { HistorialAuditoriaReporte } from "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte";
import { EstadoPreflight } from "@/modulos/reportes/componentes/estado-preflight";
import { VistaPreviaReporte } from "@/modulos/reportes/componentes/detalle/vista-previa-reporte";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
          ejecucion.estado === "preparando" || ejecucion.estado === "iniciada",
      )
        ? 2_000
        : false,
  });

  const ejecutar = useMutation({
    mutationFn: () => ejecutarReporte(id),
    onSuccess: (resultado) => {
      mostrarExito("Reporte enviado a procesamiento");
      void client.invalidateQueries({
        queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
      });
      void navegar({
        to: "/descargas",
        search: { carpeta: resultado.carpetaDescargas },
      });
    },
    onError: (error: Error) => mostrarError(error.message),
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
  const procesando = ejecucionesActuales.some(
    (item) => item.estado === "preparando" || item.estado === "iniciada",
  );
  const urlQlik = tenantActivo?.host
    ? construirUrlVerFlujoQlik(tenantActivo.host, id, dataflow.espacioId ?? "")
    : null;
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
        description={`Espacio: ${dataflow.espacioNombre ?? "Personal"}`}
        actions={
          <div className="flex flex-wrap gap-2">
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
              onClick={() => ejecutar.mutate()}
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

      <div className="flex w-fit gap-1 border-b border-line-200 text-sm">
        {(
          [
            ["resumen", "Resumen"],
            ["tecnico", "Detalles técnicos"],
            ["historial", "Historial"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
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

      {procesando && (
        <output className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
          <span>
            <strong className="block font-semibold">
              Preparando el reporte…
            </strong>
            Los archivos aparecerán en Descargas cuando el proceso finalice.
          </span>
        </output>
      )}

      {pestana === "resumen" && (
        <div className="space-y-5">
          <PestanaScriptFlujo
            resumen={resumen.data}
            cargando={resumen.isLoading}
            actualizando={resumen.isFetching}
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
        <div className="space-y-5">
          <PestanaMetadataFlujo flujo={flujo} />
          <section className="rounded-lg border border-line-200 bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">
              Validación y SQL
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
        <HistorialAuditoriaReporte
          ejecuciones={ejecucionesActuales}
          mostrarDetallesTecnicos={false}
        />
      )}
    </PageLayout>
  );
}

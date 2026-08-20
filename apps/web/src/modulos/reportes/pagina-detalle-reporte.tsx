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
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { HistorialAuditoriaReporte } from "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte";
import { EstadoPreflight } from "@/modulos/reportes/componentes/estado-preflight";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

export function PaginaDetalleReporte({ id }: { id: string }) {
  const { tenant: tenantActivo } = useTenantActivo();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const client = useQueryClient();
  const [pestana, setPestana] = useState<"diseno" | "detalles" | "historial">(
    "diseno",
  );
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
  const ejecuciones = useQuery({
    queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
    queryFn: () => obtenerEjecucionesReporte(id),
    retry: false,
    refetchInterval: (consulta) => {
      const hayActivas = consulta.state.data?.some(
        (ejecucion) =>
          ejecucion.estado === "preparando" || ejecucion.estado === "iniciada",
      );
      return hayActivas ? 2_000 : false;
    },
  });
  const ejecutar = useMutation({
    mutationFn: () => ejecutarReporte(id),
    onSuccess: () => {
      mostrarExito("Ejecución iniciada");
      void client.invalidateQueries({
        queryKey: ["ejecuciones-reporte", tenantActivo?.id, id],
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
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-500"
      >
        <Icon name="chev" size="sm" className="rotate-180" /> Volver a reportes
      </Link>
      <PageHeader
        title={dataflow.nombre}
        description={`Dataflow de Qlik · Espacio ${dataflow.espacioNombre ?? "Personal"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {urlQlik ? (
              <Button asChild variant="outline" size="sm">
                <a href={urlQlik} target="_blank" rel="noopener noreferrer">
                  <Icon name="ext" size="sm" /> Ver en Qlik Cloud
                </a>
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={ejecutar.isPending}
              onClick={() => ejecutar.mutate()}
            >
              <Icon name="play" size="sm" />{" "}
              {ejecutar.isPending ? "Ejecutando…" : "Ejecutar reporte"}
            </Button>
          </div>
        }
      />
      <div className="flex max-w-fit rounded-xl bg-line-200/60 p-1 text-sm shadow-xs">
        {(
          [
            ["diseno", "Diseño y validación"],
            ["detalles", "Detalles"],
            ["historial", "Historial"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPestana(key)}
            className={`rounded-lg px-4 py-2 font-semibold ${pestana === key ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {(ejecuciones.data ?? []).some(
        (item) => item.estado === "preparando" || item.estado === "iniciada",
      ) ? (
        <output className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
          <span>
            El reporte sigue procesándose. La automatización puede haber
            terminado mientras el job genera los archivos.
          </span>
        </output>
      ) : null}
      {pestana === "diseno" ? (
        <div className="space-y-6">
          <PestanaScriptFlujo
            resumen={resumen.data}
            cargando={resumen.isLoading}
            actualizando={resumen.isFetching}
            error={resumen.error}
            onActualizar={() => void resumen.refetch()}
          />
          <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-card">
            <h2 className="mb-3 font-semibold text-ink-900">Preflight</h2>
            <EstadoPreflight
              preflight={preflight.data}
              validando={preflight.isLoading}
              error={preflight.error}
            />
          </section>
        </div>
      ) : null}
      {pestana === "detalles" ? <PestanaMetadataFlujo flujo={flujo} /> : null}
      {pestana === "historial" ? (
        <HistorialAuditoriaReporte
          ejecuciones={ejecuciones.data ?? []}
          mostrarDetallesTecnicos={false}
        />
      ) : null}
    </PageLayout>
  );
}

import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Icon } from "@/compartido/componentes/ui/icon";
import {
  clonarReporte,
  ejecutarReporte,
  obtenerEjecucionesReporte,
  obtenerReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { ConfiguracionDataflowReporte } from "@/modulos/reportes/componentes/detalle/configuracion-dataflow-reporte";
import { HistorialAuditoriaReporte } from "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

export function PaginaDetalleReporte({ id }: { id: string }) {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const client = useQueryClient();
  const navegar = useNavigate();
  const reporte = useQuery({
    queryKey: ["reporte", id],
    queryFn: () => obtenerReporte(id),
    retry: false,
  });
  const preflight = useQuery({
    queryKey: ["preflight-dataflow-reporte", reporte.data?.flujoIdQlik],
    queryFn: () => preflightDataflowReporte(reporte.data?.flujoIdQlik ?? ""),
    enabled: Boolean(reporte.data?.flujoIdQlik),
    retry: false,
  });
  const ejecuciones = useQuery({
    queryKey: ["ejecuciones-reporte", id],
    queryFn: () => obtenerEjecucionesReporte(id),
    retry: false,
  });
  const ejecutar = useMutation({
    mutationFn: () => ejecutarReporte(id),
    onSuccess: () => {
      mostrarExito("Ejecución iniciada");
      void client.invalidateQueries({ queryKey: ["ejecuciones-reporte", id] });
    },
    onError: (error: Error) => mostrarError(error.message),
  });
  const clonar = useMutation({
    mutationFn: (nombre: string) => clonarReporte(id, { nombre }),
    onSuccess: (resultado) => {
      mostrarExito("Reporte clonado");
      navegar({ to: `/reportes/${resultado.id}` });
    },
    onError: (error: Error) => mostrarError(error.message),
  });
  if (reporte.isLoading)
    return <p className="p-8 text-ink-500">Cargando reporte…</p>;
  if (reporte.isError || !reporte.data)
    return (
      <EstadoError
        mensaje={reporte.error?.message ?? "No se pudo cargar el reporte"}
        onReintentar={() => void reporte.refetch()}
      />
    );
  const local = reporte.data;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link
        to="/reportes"
        className="inline-flex items-center gap-2 text-sm text-ink-500"
      >
        <Icon name="chev" size="sm" className="rotate-180" />
        Volver a reportes
      </Link>
      <header className="border-b border-line-200 pb-5">
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          {local.nombre}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Reporte local basado en el Dataflow seleccionado.
        </p>
      </header>
      <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink-500">Estado</p>
            <p className="font-semibold text-ink-900">
              {local.activa ? "Disponible" : "Inactivo"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!local.activa || ejecutar.isPending}
              onClick={() => ejecutar.mutate()}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {ejecutar.isPending ? "Ejecutando…" : "Ejecutar reporte"}
            </button>
            <button
              type="button"
              onClick={() => clonar.mutate(`${local.nombre} (copia)`)}
              className="rounded-md border border-line-200 px-4 py-2 text-sm font-semibold"
            >
              Clonar reporte
            </button>
          </div>
        </div>
      </section>
      <ConfiguracionDataflowReporte
        reporteId={id}
        configuracion={local}
        preflight={preflight.data}
        validandoDataflow={preflight.isLoading}
      />
      <HistorialAuditoriaReporte
        ejecuciones={ejecuciones.data ?? []}
        mostrarDetallesTecnicos={false}
      />
    </div>
  );
}

import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import {
  actualizarConfiguracionReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import type {
  ActualizarConfiguracionReporte,
  ConfiguracionReporteDataflow,
} from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function ConfiguracionDataflowReporte({
  automatizacionId,
  configuracion,
  preflight,
  validandoDataflow,
}: {
  automatizacionId: string;
  configuracion: ConfiguracionReporteDataflow;
  preflight: Awaited<ReturnType<typeof preflightDataflowReporte>> | undefined;
  validandoDataflow: boolean;
}) {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(configuracion.nombre);
  const [flujoId, setFlujoId] = useState(configuracion.flujoIdQlik);
  const [activa, setActiva] = useState(configuracion.activa);

  const { data: flujos = [] } = useQuery({
    queryKey: ["flujos-edicion-reporte"],
    queryFn: () => obtenerFlujosConFiltros(),
    enabled: editando,
  });
  const { data: preflightEdicion, isLoading: validandoEdicion } = useQuery({
    queryKey: ["preflight-edicion-reporte", flujoId],
    queryFn: () => preflightDataflowReporte(flujoId),
    enabled: editando && Boolean(flujoId),
    retry: false,
  });

  useEffect(() => {
    if (!editando) {
      setNombre(configuracion.nombre);
      setFlujoId(configuracion.flujoIdQlik);
      setActiva(configuracion.activa);
    }
  }, [configuracion, editando]);

  const guardar = useMutation({
    mutationFn: () => {
      const cambios: ActualizarConfiguracionReporte = {
        nombre: nombre.trim(),
        flujoIdQlik: flujoId,
        activa,
      };
      return actualizarConfiguracionReporte(automatizacionId, cambios);
    },
    onSuccess: async () => {
      mostrarExito("Configuración actualizada");
      setEditando(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["configuracion-reporte", automatizacionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["preflight-dataflow-detalle"],
        }),
      ]);
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  if (editando) {
    const compatible = preflightEdicion?.compatible === true;
    return (
      <section className="rounded-xl border border-line-200 bg-surface shadow-card">
        <div className="border-b border-line-200 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            Configuración del reporte
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Editar propiedades
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            El diseño de campos, filtros, joins y cálculos se modifica en Qlik
            Dataflow, no en esta pantalla.
          </p>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-ink-800">
              Nombre del reporte
              <input
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                className="h-10 w-full rounded-md border border-line-200 px-3 font-normal outline-none focus:border-brand-600"
              />
            </label>
            <label className="space-y-1.5 text-sm font-semibold text-ink-800">
              Cambiar Dataflow
              <select
                value={flujoId}
                onChange={(evento) => setFlujoId(evento.target.value)}
                className="h-10 w-full rounded-md border border-line-200 px-3 font-normal outline-none focus:border-brand-600"
              >
                {!flujos.some((item) => item.id === flujoId) ? (
                  <option value={flujoId}>
                    {configuracion.flujoNombreSnapshot}
                  </option>
                ) : null}
                {flujos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} · {item.espacioNombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-line-200 bg-app px-4 py-3 text-sm">
            {validandoEdicion ? (
              <span className="text-ink-500">Validando Dataflow…</span>
            ) : compatible ? (
              <span className="font-semibold text-emerald-700">
                ✓ Dataflow compatible
              </span>
            ) : (
              <span className="font-semibold text-danger-700">
                El Dataflow seleccionado no es compatible.
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink-800">
              <input
                type="checkbox"
                checked={activa}
                onChange={(evento) => setActiva(evento.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand-600)]"
              />
              Reporte activo
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-line-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                guardar.isPending ||
                validandoEdicion ||
                !compatible ||
                !nombre.trim()
              }
              onClick={() => guardar.mutate()}
            >
              {guardar.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line-200 bg-surface px-5 py-5 shadow-card sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
            Configuración del reporte
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Dataflow actual
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {configuracion.flujoNombreSnapshot}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditando(true)}
          className="gap-2"
        >
          <Icon name="edit" size="sm" />
          Editar configuración
        </Button>
      </div>

      <div className="mt-5 grid gap-3 border-t border-line-200 pt-5 sm:grid-cols-3">
        <div className="rounded-lg bg-app px-4 py-3">
          <p className="text-xs font-medium text-ink-400">Dataflow</p>
          <div className="mt-1 text-sm font-semibold text-ink-900">
            {configuracion.flujoNombreSnapshot}
            <span
              className={`ml-2 text-xs font-semibold ${preflight?.compatible ? "text-emerald-700" : "text-amber-700"}`}
            >
              {validandoDataflow
                ? "Validando…"
                : preflight?.compatible
                  ? "Dataflow compatible"
                  : "Requiere atención"}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-app px-4 py-3">
          <p className="text-xs font-medium text-ink-400">Destino GCS</p>
          <div className="mt-1 text-sm font-semibold text-ink-900">
            <span className="break-all font-mono text-xs">
              {configuracion.destinoGcs}
            </span>
          </div>
        </div>
      </div>

      {preflight?.compatible ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
            {preflight.resumen.fuentes} fuentes
          </span>
          <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
            {preflight.resumen.filtros} filtros
          </span>
          <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
            {preflight.resumen.joins}{" "}
            {preflight.resumen.joins === 1 ? "join" : "joins"}
          </span>
          <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
            {preflight.resumen.camposSalida} campos
          </span>
          <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
            SHA-256 {preflight.hashDataflowSha256.slice(0, 12)}…
          </span>
        </div>
      ) : null}
    </section>
  );
}

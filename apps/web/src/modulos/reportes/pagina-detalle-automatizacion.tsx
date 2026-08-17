import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { estaEnCurso } from "@/compartido/utiles/estados-ejecucion";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import {
  type DetalleAutomatizacion,
  type EjecucionResumen,
  actualizarConfiguracionReporte,
  clonarAutomatizacion,
  detenerEjecucion,
  ejecutarAutomatizacion,
  obtenerConfiguracionReporte,
  obtenerDetalleAutomatizacion,
  obtenerEjecucionesLocalesReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { ModalClonarAutomatizacion } from "@/modulos/reportes/componentes/modal-clonar-automatizacion";
import { TarjetaDetalleAutomatizacion } from "@/modulos/reportes/componentes/tarjeta-detalle-automatizacion";
import type {
  ActualizarConfiguracionReporte,
  ConfiguracionReporteDataflow,
  DetalleEjecucionReporte,
} from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface Props {
  id: string;
}

export function PaginaDetalleAutomatizacion({ id }: Props) {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const [modalClonarAbierto, setModalClonarAbierto] = useState(false);

  const { data: sesion } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: detalle,
    isLoading: cargandoDetalle,
    isError: errorDetalle,
    error: errorDetalleMsg,
  } = useQuery<DetalleAutomatizacion>({
    queryKey: ["automatizacion", id],
    queryFn: () => obtenerDetalleAutomatizacion(id),
    retry: false,
    refetchInterval: (consulta) => {
      const actual = consulta.state.data as DetalleAutomatizacion | undefined;
      const activa =
        actual?.automatizacion.ejecucionActiva ||
        actual?.ejecuciones.some((ejecucion) => estaEnCurso(ejecucion.estado));
      return activa ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const {
    data: configuracion,
    isLoading: cargandoConfiguracion,
    isError: errorConfiguracion,
    error: errorConfiguracionMsg,
  } = useQuery({
    queryKey: ["configuracion-reporte", id],
    queryFn: () => obtenerConfiguracionReporte(id),
    retry: false,
  });

  const { data: preflight, isLoading: validandoDataflow } = useQuery({
    queryKey: ["preflight-dataflow-detalle", configuracion?.flujoIdQlik],
    queryFn: () => preflightDataflowReporte(configuracion?.flujoIdQlik ?? ""),
    enabled: Boolean(configuracion?.flujoIdQlik),
    retry: false,
  });

  const { data: ejecucionesLocales = [] } = useQuery({
    queryKey: ["ejecuciones-locales-reporte", id],
    queryFn: () => obtenerEjecucionesLocalesReporte(id),
    retry: false,
    refetchInterval: (consulta) => {
      const ejecuciones = consulta.state.data as
        | DetalleEjecucionReporte[]
        | undefined;
      return ejecuciones?.some((item) =>
        ["preparando", "iniciada"].includes(item.estado),
      )
        ? 3000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const mutationEjecutar = useMutation({
    mutationFn: () => ejecutarAutomatizacion(id),
    onSuccess: async () => {
      mostrarExito("Ejecución iniciada");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automatizacion", id] }),
        queryClient.invalidateQueries({
          queryKey: ["ejecuciones-locales-reporte", id],
        }),
      ]);
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const mutationDetener = useMutation({
    mutationFn: (runId: string) => detenerEjecucion(id, runId),
    onSuccess: async () => {
      mostrarExito("Ejecución detenida");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automatizacion", id] }),
        queryClient.invalidateQueries({
          queryKey: ["ejecuciones-locales-reporte", id],
        }),
      ]);
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const mutationClonar = useMutation({
    mutationFn: (nombre: string) => clonarAutomatizacion(id, { nombre }),
    onSuccess: (resultado) => {
      mostrarExito(`Automatización "${resultado.nombre}" clonada`);
      setModalClonarAbierto(false);
      queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
      navegar({ to: `/reportes/${resultado.id}` });
    },
    onError: (error: Error) => {
      mostrarError(error.message);
      setModalClonarAbierto(false);
    },
  });

  if (cargandoDetalle || cargandoConfiguracion) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="font-medium text-ink-500">Cargando reporte…</p>
      </div>
    );
  }

  if (errorDetalle || errorConfiguracion) {
    return (
      <EstadoError
        mensaje={
          errorDetalleMsg?.message ??
          errorConfiguracionMsg?.message ??
          "Error al cargar el detalle del reporte"
        }
        onReintentar={() => {
          queryClient.invalidateQueries({ queryKey: ["automatizacion", id] });
          queryClient.invalidateQueries({
            queryKey: ["configuracion-reporte", id],
          });
        }}
      />
    );
  }

  const auto = detalle?.automatizacion;
  if (!auto || !configuracion) return null;

  const ejecucionesQlik = detalle?.ejecuciones ?? [];
  const ejecutandoActiva = ejecucionesQlik.find((ejecucion: EjecucionResumen) =>
    estaEnCurso(ejecucion.estado),
  );
  const ultimaEjecucionQlik = ejecucionesQlik.reduce<
    EjecucionResumen | undefined
  >((ultima, ejecucion) => {
    if (!ultima) return ejecucion;
    return new Date(ejecucion.iniciadoEn ?? 0).getTime() >
      new Date(ultima.iniciadoEn ?? 0).getTime()
      ? ejecucion
      : ultima;
  }, undefined);
  const hostQlik = sesion?.tenantHost?.trim();
  const urlQlik = hostQlik
    ? new URL(`/automations/${id}`, `https://${hostQlik}`).toString()
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link
        to="/reportes"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <Icon name="chev" size="sm" className="rotate-180" />
        Volver a reportes
      </Link>

      <header className="border-b border-line-200 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
          <Icon name="file-text" size="sm" />
          Detalle del reporte
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-[28px]">
          {configuracion.nombre}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">
          El diseño se toma del Dataflow actual. Antes de cada ejecución la
          plataforma vuelve a leerlo, compila el SQL y actualiza Qlik Automate.
        </p>
      </header>

      <TarjetaDetalleAutomatizacion
        automatizacion={auto}
        ejecutandoActiva={ejecutandoActiva}
        ultimaEjecucion={ultimaEjecucionQlik}
        urlQlik={urlQlik}
        onEjecutar={() => mutationEjecutar.mutate()}
        onDetener={(runId) => mutationDetener.mutate(runId)}
        mutationEjecutar={mutationEjecutar}
        mutationDetener={mutationDetener}
        onClonar={() => setModalClonarAbierto(true)}
        mostrarWorkspace={false}
      />

      <ConfiguracionDataflowReporte
        automatizacionId={id}
        configuracion={configuracion}
        preflight={preflight}
        validandoDataflow={validandoDataflow}
      />

      <HistorialAuditoriaReporte ejecuciones={ejecucionesLocales} />

      <ModalClonarAutomatizacion
        open={modalClonarAbierto}
        nombreOriginal={configuracion.nombre}
        cargando={mutationClonar.isPending}
        onConfirmar={(nombre) => mutationClonar.mutate(nombre)}
        onCancelar={() => setModalClonarAbierto(false)}
      />
    </div>
  );
}

function ConfiguracionDataflowReporte({
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
        <Dato etiqueta="Dataflow">
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
        </Dato>
        <Dato etiqueta="Destino GCS">
          <span className="break-all font-mono text-xs">
            {configuracion.destinoGcs}
          </span>
        </Dato>
      </div>

      {preflight?.compatible ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip>{preflight.resumen.fuentes} fuentes</Chip>
          <Chip>{preflight.resumen.filtros} filtros</Chip>
          <Chip>
            {preflight.resumen.joins}{" "}
            {preflight.resumen.joins === 1 ? "join" : "joins"}
          </Chip>
          <Chip>{preflight.resumen.camposSalida} campos</Chip>
          <Chip>SHA-256 {preflight.hashDataflowSha256.slice(0, 12)}…</Chip>
        </div>
      ) : null}
    </section>
  );
}

function HistorialAuditoriaReporte({
  ejecuciones,
}: {
  ejecuciones: DetalleEjecucionReporte[];
}) {
  return (
    <section className="rounded-xl border border-line-200 bg-surface shadow-card">
      <div className="border-b border-line-200 px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
          Auditoría de ejecuciones
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
          Dataflow y SQL realmente utilizados
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Cada ejecución conserva su huella, snapshot y scripts aunque el
          Dataflow cambie después.
        </p>
      </div>

      {ejecuciones.length === 0 ? (
        <div className="px-5 py-8 text-sm text-ink-500 sm:px-6">
          Todavía no hay ejecuciones auditadas desde la plataforma.
        </div>
      ) : (
        <div className="divide-y divide-line-200">
          {ejecuciones.map((ejecucion) => (
            <article key={ejecucion.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoAuditoria estado={ejecucion.estado} />
                    <span className="rounded-full bg-app px-2.5 py-1 text-xs font-semibold text-ink-600">
                      Manual
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink-800">
                    {formatearFecha(ejecucion.iniciadoEn ?? ejecucion.creadoEn)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-400">SHA-256</p>
                  <p className="font-mono text-xs font-semibold text-ink-700">
                    {ejecucion.hashDataflowSha256.slice(0, 16)}…
                  </p>
                </div>
              </div>

              <p className="mt-3 break-all font-mono text-[11px] text-ink-500">
                {ejecucion.uriBaseGcs}
              </p>

              {ejecucion.mensajeError ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {ejecucion.etapaError ? `${ejecucion.etapaError}: ` : ""}
                  {ejecucion.mensajeError}
                </p>
              ) : null}

              <details className="mt-3 rounded-lg border border-line-200 bg-app">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-700">
                  Ver auditoría técnica
                </summary>
                <div className="space-y-4 border-t border-line-200 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      SHA-256 completo
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-ink-700">
                      {ejecucion.hashDataflowSha256}
                    </p>
                  </div>
                  <BloqueCodigo
                    titulo="Script Dataflow utilizado"
                    contenido={ejecucion.scriptDataflow}
                  />
                  <BloqueCodigo
                    titulo="SQL BigQuery compilado"
                    contenido={ejecucion.sqlBigQueryCompilado}
                  />
                  <BloqueCodigo
                    titulo="Script enviado a Talend"
                    contenido={ejecucion.scriptExportacion}
                  />
                  <div className="grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                    <span>Qlik run: {ejecucion.runIdQlik ?? "—"}</span>
                    <span>Compilador: v{ejecucion.versionCompilador}</span>
                  </div>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Dato({
  etiqueta,
  children,
}: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-app px-4 py-3">
      <p className="text-xs font-medium text-ink-400">{etiqueta}</p>
      <div className="mt-1 text-sm font-semibold text-ink-900">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-600">
      {children}
    </span>
  );
}

function EstadoAuditoria({ estado }: { estado: string }) {
  const clases =
    estado === "completada"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estado === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : estado === "detenida"
          ? "border-line-200 bg-app text-ink-600"
          : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${clases}`}
    >
      {estado}
    </span>
  );
}

function BloqueCodigo({
  titulo,
  contenido,
}: { titulo: string; contenido: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {titulo}
      </p>
      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
        {contenido}
      </pre>
    </div>
  );
}

function formatearFecha(valor: string | null | undefined) {
  if (!valor) return "Sin fecha";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(fecha);
}

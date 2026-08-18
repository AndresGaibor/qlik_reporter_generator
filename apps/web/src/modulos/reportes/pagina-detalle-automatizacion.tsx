import { useVistaUsuarioFinal } from "@/app/contexto-vista";
import { ErrorClienteApi } from "@/compartido/api/cliente";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Icon } from "@/compartido/componentes/ui/icon";
import { estaEnCurso } from "@/compartido/utiles/estados-ejecucion";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import {
  type DetalleAutomatizacion,
  type EjecucionResumen,
  clonarAutomatizacion,
  detenerEjecucion,
  ejecutarAutomatizacion,
  obtenerConfiguracionReporte,
  obtenerDetalleAutomatizacion,
  obtenerEjecucionesLocalesReporte,
  preflightDataflowReporte,
} from "@/modulos/reportes/api";
import { ConfiguracionDataflowReporte } from "@/modulos/reportes/componentes/detalle/configuracion-dataflow-reporte";
import { HistorialAuditoriaReporte } from "@/modulos/reportes/componentes/detalle/historial-auditoria-reporte";
import { ModalClonarAutomatizacion } from "@/modulos/reportes/componentes/modal-clonar-automatizacion";
import { TarjetaDetalleAutomatizacion } from "@/modulos/reportes/componentes/tarjeta-detalle-automatizacion";
import type { DetalleEjecucionReporte } from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface Props {
  id: string;
}

export function PaginaDetalleAutomatizacion({ id }: Props) {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const [modalClonarAbierto, setModalClonarAbierto] = useState(false);
  const modoUsuarioFinal = useVistaUsuarioFinal();

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
    enabled: Boolean(configuracion),
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

  const configuracionNoRegistrada =
    errorConfiguracion &&
    errorConfiguracionMsg instanceof ErrorClienteApi &&
    errorConfiguracionMsg.estado === 404;

  if (errorDetalle || (errorConfiguracion && !configuracionNoRegistrada)) {
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
  if (!auto) return null;

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
  const organizacionActivaId = sesion?.tenantsDisponibles?.find(
    (tenant) => tenant.id === sesion.tenantActivoId,
  )?.organizacionId;
  const esAdmin = Boolean(
    sesion?.esSuperadmin ||
      sesion?.membresias?.some(
        (m) =>
          m.rol === "admin" &&
          (!organizacionActivaId || m.organizacionId === organizacionActivaId),
      ),
  );
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
          {configuracion?.nombre ?? auto.nombre}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-500">
          {configuracion
            ? "El diseño se toma del Dataflow actual. Antes de cada ejecución la plataforma vuelve a leerlo, compila el SQL y actualiza Qlik Automate."
            : "Esta automatización se obtuvo directamente de Qlik Cloud y todavía no tiene una configuración local asociada."}
        </p>
      </header>

      {!configuracion && configuracionNoRegistrada && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-card">
          <p className="font-semibold">
            Automatización de Qlik sin configuración local
          </p>
          <p className="mt-1 text-sm leading-6">
            Puedes consultar su estado y sus ejecuciones de Qlik desde esta
            página. Para ejecutarla desde la plataforma primero debe vincularse
            a un Dataflow y guardar su configuración local.
          </p>
        </div>
      )}

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
        mostrarWorkspace={esAdmin && !modoUsuarioFinal}
        ejecucionDesdePlataformaHabilitada={Boolean(configuracion)}
      />

      {configuracion && (
        <>
          <ConfiguracionDataflowReporte
            automatizacionId={id}
            configuracion={configuracion}
            preflight={preflight}
            validandoDataflow={validandoDataflow}
          />

          <HistorialAuditoriaReporte
            ejecuciones={ejecucionesLocales}
            mostrarDetallesTecnicos={esAdmin && !modoUsuarioFinal}
          />
        </>
      )}

      <ModalClonarAutomatizacion
        open={modalClonarAbierto}
        nombreOriginal={configuracion?.nombre ?? auto.nombre}
        cargando={mutationClonar.isPending}
        onConfirmar={(nombre) => mutationClonar.mutate(nombre)}
        onCancelar={() => setModalClonarAbierto(false)}
      />
    </div>
  );
}

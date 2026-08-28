import { useContextoVista } from "@/app/contexto-vista";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { ModalCompartir } from "@/compartido/componentes/ui/modal-compartir";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import {
  ejecutarReporte,
  guardarCompartidoReporte,
  listarUsuariosCompartiblesReporte,
  obtenerCompartidoReporte,
  obtenerPlantillasDataflowReporte,
  obtenerReportes,
} from "@/modulos/reportes/api";
import type { ResumenReporte } from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarraFiltrosReportes } from "./componentes/barra-filtros-reportes";
import { ListaReportes } from "./componentes/lista-reportes";
import { ModalConfirmacionRiesgo } from "./componentes/modal-confirmacion-riesgo";
import { ModalCrearReporteDesdePlantilla } from "./componentes/modal-crear-reporte-desde-plantilla";
import { PaginacionLista } from "./componentes/paginacion-lista";
import { filtrarReportes } from "./filtrar-reportes";
import { hashRiesgoDevuelto } from "./utiles-riesgo-ejecucion";

export function PaginaReportes() {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const { tenant: tenantActivo } = useTenantActivo();
  const { modoUsuarioFinal } = useContextoVista();
  const { espacioId, establecerEspacioId } = useFiltroEspacioConPersistencia(
    tenantActivo?.id,
  );
  const { busquedaTemp, setBusquedaTemp, busquedaActiva, buscar, limpiar } =
    useBusqueda();
  const [idEjecutando, setIdEjecutando] = useState<string | null>(null);
  const [riesgoPendiente, setRiesgoPendiente] = useState<{
    id: string;
    hash: string;
  } | null>(null);
  const [reporteCompartiendo, setReporteCompartiendo] =
    useState<ResumenReporte | null>(null);
  const consulta = useQuery({
    queryKey: ["reportes", tenantActivo?.id, modoUsuarioFinal],
    queryFn: () => obtenerReportes(undefined, undefined, modoUsuarioFinal),
    retry: false,
  });
  const plantilla = useQuery({
    queryKey: ["reportes-plantilla-base", tenantActivo?.id],
    queryFn: obtenerPlantillasDataflowReporte,
    retry: false,
  });
  const [modalAbierto, setModalAbierto] = useState(false);
  const filtrados = useMemo(
    () => filtrarReportes(consulta.data ?? [], busquedaActiva, espacioId),
    [consulta.data, busquedaActiva, espacioId],
  );
  const espacios = useMemo(() => {
    return Array.from(
      new Map(
        (consulta.data ?? [])
          .filter((reporte) => reporte.espacioId)
          .map((reporte) => {
            const espacioId = reporte.espacioId as string;
            return [
              espacioId,
              { id: espacioId, nombre: reporte.espacioNombre ?? espacioId },
            ] as const;
          }),
      ).values(),
    );
  }, [consulta.data]);
  const paginacion = usePaginacion(filtrados);
  const ejecutar = useMutation({
    mutationFn: (entrada: { id: string; hash?: string }) =>
      ejecutarReporte(
        entrada.id,
        entrada.hash ? { hashDataflowSha256: entrada.hash } : undefined,
      ),
    onMutate: (entrada) => setIdEjecutando(entrada.id),
    onSuccess: (resultado) => {
      mostrarExito("Ejecución del reporte iniciada");
      void queryClient.invalidateQueries({ queryKey: ["reportes"] });
      void navegar({
        to: "/descargas",
        search: { carpeta: resultado.carpetaDescargas },
      });
    },
    onError: (error: Error, entrada) => {
      const hash = hashRiesgoDevuelto(error);
      if (hash) setRiesgoPendiente({ id: entrada.id, hash });
      else mostrarError(error.message);
    },
    onSettled: () => setIdEjecutando(null),
  });
  if (consulta.isLoading) return <EstadoCarga mensaje="Cargando reportes..." />;
  if (consulta.isError)
    return (
      <EstadoError
        mensaje={consulta.error.message}
        onReintentar={() => void consulta.refetch()}
      />
    );
  return (
    <PageLayout>
      <div className="space-y-4">
        <BarraFiltrosReportes
          busquedaTemp={busquedaTemp}
          setBusquedaTemp={setBusquedaTemp}
          buscar={buscar}
          limpiar={limpiar}
          espacios={espacios}
          errorEspacios={false}
          espacioFiltrado={espacioId}
          onEspacioChange={establecerEspacioId}
          totalResultados={filtrados.length}
          onCrearReporte={() => setModalAbierto(true)}
        />
        <ListaReportes
          reportes={paginacion.elementosPagina}
          idEjecutando={idEjecutando}
          onEjecutar={(id) => ejecutar.mutate({ id })}
          onCompartir={setReporteCompartiendo}
          hayFiltros={Boolean(busquedaActiva || espacioId)}
        />
        {filtrados.length > 10 ? (
          <PaginacionLista
            paginaActual={paginacion.paginaActual}
            totalPaginas={paginacion.totalPaginas}
            onIrPagina={paginacion.irPagina}
            inicio={(paginacion.paginaActual - 1) * 10}
            total={filtrados.length}
          />
        ) : null}
        {plantilla.data?.length && tenantActivo?.host ? (
          <ModalCrearReporteDesdePlantilla
            abierto={modalAbierto}
            plantillas={plantilla.data}
            host={tenantActivo.host}
            onCerrar={() => setModalAbierto(false)}
            onCreado={() =>
              void queryClient.invalidateQueries({ queryKey: ["reportes"] })
            }
          />
        ) : null}
        <ModalConfirmacionRiesgo
          abierto={riesgoPendiente !== null}
          onVolver={() => setRiesgoPendiente(null)}
          onConfirmar={() => {
            if (riesgoPendiente) ejecutar.mutate(riesgoPendiente);
          }}
        />
        {reporteCompartiendo && (
          <CompartirReporte
            reporte={reporteCompartiendo}
            onCerrar={() => setReporteCompartiendo(null)}
            onGuardado={() => {
              setReporteCompartiendo(null);
              mostrarExito("Acceso al reporte actualizado");
              void queryClient.invalidateQueries({ queryKey: ["reportes"] });
            }}
            onError={mostrarError}
          />
        )}
      </div>
    </PageLayout>
  );
}

function CompartirReporte({
  reporte,
  onCerrar,
  onGuardado,
  onError,
}: {
  reporte: ResumenReporte;
  onCerrar: () => void;
  onGuardado: () => void;
  onError: (mensaje: string) => void;
}) {
  const usuarios = useQuery({
    queryKey: ["usuarios-compartibles-reportes"],
    queryFn: listarUsuariosCompartiblesReporte,
  });
  const compartido = useQuery({
    queryKey: ["reporte-compartido", reporte.id],
    queryFn: () => obtenerCompartidoReporte(reporte.id),
  });
  const [seleccionados, setSeleccionados] = useState<string[] | null>(null);
  const [todos, setTodos] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const seleccionActual = seleccionados ?? compartido.data?.usuarios ?? [];
  const todosActual = todos ?? compartido.data?.todaOrganizacion ?? false;

  async function guardar() {
    setGuardando(true);
    try {
      await guardarCompartidoReporte(reporte.id, {
        todaOrganizacion: todosActual,
        usuarios: todosActual ? [] : seleccionActual,
      });
      onGuardado();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo compartir");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalCompartir
      titulo={`Compartir ${reporte.nombre}`}
      usuarios={usuarios.data ?? []}
      todaOrganizacion={todosActual}
      seleccionados={seleccionActual}
      cargando={usuarios.isLoading || compartido.isLoading}
      guardando={guardando}
      onTodaOrganizacion={setTodos}
      onSeleccionados={setSeleccionados}
      onCerrar={onCerrar}
      onGuardar={() => void guardar()}
    />
  );
}

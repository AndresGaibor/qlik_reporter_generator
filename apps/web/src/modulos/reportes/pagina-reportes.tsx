import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import {
  ejecutarReporte,
  obtenerDataflowBaseReporte,
  obtenerReportes,
} from "@/modulos/reportes/api";
import type { ResumenReporte } from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarraFiltrosReportes } from "./componentes/barra-filtros-reportes";
import { ListaReportes } from "./componentes/lista-reportes";
import { ModalCrearReporteDesdePlantilla } from "./componentes/modal-crear-reporte-desde-plantilla";
import { PaginacionLista } from "./componentes/paginacion-lista";

export function filtrarReportes(
  reportes: ResumenReporte[],
  busqueda: string,
  espacioId: string,
) {
  const termino = busqueda.trim().toLocaleLowerCase();
  return reportes.filter((reporte) => {
    const coincideBusqueda =
      !termino ||
      [reporte.nombre, reporte.espacioNombre ?? ""].some((valor) =>
        valor.toLocaleLowerCase().includes(termino),
      );
    return coincideBusqueda && (!espacioId || reporte.espacioId === espacioId);
  });
}

export function PaginaReportes() {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const { tenant: tenantActivo } = useTenantActivo();
  const { espacioId, establecerEspacioId } = useFiltroEspacioConPersistencia(
    tenantActivo?.id,
  );
  const { busquedaTemp, setBusquedaTemp, busquedaActiva, buscar, limpiar } =
    useBusqueda();
  const [idEjecutando, setIdEjecutando] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ["reportes", tenantActivo?.id],
    queryFn: () => obtenerReportes(),
    retry: false,
  });
  const plantilla = useQuery({
    queryKey: ["reportes-plantilla-base", tenantActivo?.id],
    queryFn: obtenerDataflowBaseReporte,
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
    mutationFn: ejecutarReporte,
    onMutate: setIdEjecutando,
    onSuccess: (resultado) => {
      mostrarExito("Ejecución del reporte iniciada");
      void queryClient.invalidateQueries({ queryKey: ["reportes"] });
      void navegar({
        to: "/descargas",
        search: { carpeta: resultado.carpetaDescargas },
      });
    },
    onError: (error: Error) => mostrarError(error.message),
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
          onEjecutar={(id) => ejecutar.mutate(id)}
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
        {plantilla.data && tenantActivo?.host ? (
          <ModalCrearReporteDesdePlantilla
            abierto={modalAbierto}
            nombrePlantilla={plantilla.data.nombre}
            host={tenantActivo.host}
            onCerrar={() => setModalAbierto(false)}
            onCreado={() =>
              void queryClient.invalidateQueries({ queryKey: ["reportes"] })
            }
          />
        ) : null}
      </div>
    </PageLayout>
  );
}

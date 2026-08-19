import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import { ejecutarReporte, obtenerReportes } from "@/modulos/reportes/api";
import type { ResumenReporte } from "@qlik/contratos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarraFiltrosAutomatizaciones } from "./componentes/barra-filtros-automatizaciones";
import { ListaReportes } from "./componentes/lista-reportes";
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
      [reporte.nombre, reporte.flujoNombreSnapshot].some((valor) =>
        valor.toLocaleLowerCase().includes(termino),
      );
    return (
      coincideBusqueda &&
      (!espacioId || reporte.flujoEspacioIdQlik === espacioId)
    );
  });
}

export function PaginaReportes() {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
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
  const flujos = useQuery({
    queryKey: ["flujos-espacios-reportes", tenantActivo?.id],
    queryFn: () => obtenerFlujosConFiltros(),
    retry: false,
  });
  const filtrados = useMemo(
    () => filtrarReportes(consulta.data ?? [], busquedaActiva, espacioId),
    [consulta.data, busquedaActiva, espacioId],
  );
  const espacios = useMemo(() => {
    const nombres = new Map(
      (flujos.data ?? []).map((flujo) => [flujo.id, flujo]),
    );
    return Array.from(
      new Map(
        (consulta.data ?? [])
          .filter((reporte) => reporte.flujoEspacioIdQlik)
          .map((reporte) => {
            const espacioId = reporte.flujoEspacioIdQlik as string;
            const flujo = Array.from(nombres.values()).find(
              (item) => item.espacioId === espacioId,
            );
            return [
              espacioId,
              { id: espacioId, nombre: flujo?.espacioNombre ?? espacioId },
            ] as const;
          }),
      ).values(),
    );
  }, [consulta.data, flujos.data]);
  const paginacion = usePaginacion(filtrados);
  const ejecutar = useMutation({
    mutationFn: ejecutarReporte,
    onMutate: setIdEjecutando,
    onSuccess: async () => {
      mostrarExito("Ejecución del reporte iniciada");
      await queryClient.invalidateQueries({ queryKey: ["reportes"] });
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
        <header>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Reportes
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Reportes disponibles para tu usuario.
          </p>
        </header>
        <BarraFiltrosAutomatizaciones
          busquedaTemp={busquedaTemp}
          setBusquedaTemp={setBusquedaTemp}
          buscar={buscar}
          limpiar={limpiar}
          espacios={espacios}
          errorEspacios={flujos.isError}
          espacioFiltrado={espacioId}
          onEspacioChange={establecerEspacioId}
          totalResultados={filtrados.length}
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
      </div>
    </PageLayout>
  );
}

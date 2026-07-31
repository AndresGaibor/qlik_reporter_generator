import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import {
  type ResumenAutomatizacion,
  ejecutarAutomatizacion,
  obtenerAutomatizacionesConFiltros,
  obtenerEspacios,
} from "@/modulos/reportes/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { BarraFiltrosAutomatizaciones } from "./componentes/barra-filtros-automatizaciones";
import { ListaAutomatizaciones } from "./componentes/lista-automatizaciones";
import { PaginacionLista } from "./componentes/paginacion-lista";
import { useBusquedaDiferida } from "./hooks/use-busqueda-diferida";

export function PaginaAutomatizaciones() {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const { tenant: tenantActivo } = useTenantActivo();
  const { espacioId, establecerEspacioId } = useFiltroEspacioConPersistencia(
    tenantActivo?.id,
  );
  const espacioFiltrado = espacioId.trim() || undefined;
  const [idEjecutando, setIdEjecutando] = useState<string | null>(null);

  const {
    busquedaTemp,
    setBusquedaTemp,
    busquedaActiva,
    setBusquedaActiva,
    buscar,
    limpiar,
  } = useBusqueda();

  const {
    data: automatizaciones,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ResumenAutomatizacion[]>({
    queryKey: [
      "automatizaciones",
      tenantActivo?.id,
      espacioFiltrado,
      busquedaActiva,
    ],
    queryFn: () =>
      obtenerAutomatizacionesConFiltros(espacioFiltrado, busquedaActiva),
    retry: false,
  });

  const espacios = useQuery({
    queryKey: ["automatizaciones", "espacios", tenantActivo?.id],
    queryFn: obtenerEspacios,
    retry: false,
  });

  const ejecutar = useMutation({
    mutationFn: ejecutarAutomatizacion,
    onMutate: (id: string) => {
      setIdEjecutando(id);
    },
    onSuccess: async (_resultado, _id) => {
      mostrarExito("Ejecución del reporte iniciada");
      await queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
    },
    onError: (err: Error) => {
      mostrarError(err.message);
    },
    onSettled: () => {
      setIdEjecutando(null);
    },
  });

  const { manejar } = useManejoError(mostrarError);

  const handleRefetch = () => {
    refetch();
  };

  useEffect(() => {
    if (isError) {
      manejar(error);
    }
  }, [isError, error, manejar]);

  const {
    paginaActual,
    totalPaginas,
    elementosPagina: automatizacionesPaginados,
    irPagina,
    reset: reiniciarPaginacion,
  } = usePaginacion(automatizaciones ?? []);

  const aplicarBusqueda = useCallback(
    (valor: string) => {
      setBusquedaActiva(valor);
      reiniciarPaginacion();
    },
    [reiniciarPaginacion, setBusquedaActiva],
  );
  useBusquedaDiferida(busquedaTemp, aplicarBusqueda);

  if (isLoading) {
    return <EstadoCarga mensaje="Cargando reportes..." />;
  }

  if (isError) {
    return <EstadoError mensaje={error.message} onReintentar={handleRefetch} />;
  }

  const lista = automatizaciones ?? [];
  const inicio = (paginaActual - 1) * 10;

  return (
    <PageLayout>
      <BarraFiltrosAutomatizaciones
        busquedaTemp={busquedaTemp}
        setBusquedaTemp={setBusquedaTemp}
        buscar={(evento) => {
          buscar(evento);
          reiniciarPaginacion();
        }}
        limpiar={() => {
          limpiar();
          reiniciarPaginacion();
        }}
        espacios={espacios.data ?? []}
        errorEspacios={espacios.isError}
        espacioFiltrado={espacioFiltrado}
        onEspacioChange={(id) => {
          establecerEspacioId(id);
          reiniciarPaginacion();
        }}
        totalResultados={lista.length}
      />

      <div className="space-y-4">
        <ListaAutomatizaciones
          automatizaciones={automatizacionesPaginados}
          idEjecutando={idEjecutando}
          espacioFiltrado={espacioFiltrado}
          targetHost={tenantActivo?.host}
          hayFiltros={Boolean(espacioFiltrado || busquedaActiva)}
          onEjecutar={(id) => ejecutar.mutate(id)}
        />

        {lista.length > 0 && (
          <PaginacionLista
            paginaActual={paginaActual}
            totalPaginas={totalPaginas}
            onIrPagina={irPagina}
            inicio={inicio}
            total={lista.length}
          />
        )}
      </div>
    </PageLayout>
  );
}

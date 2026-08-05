import { useVistaUsuarioFinal } from "@/app/contexto-vista";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { obtenerAutorReporte } from "@/compartido/utiles/automatizaciones";
import { obtenerSesion } from "@/modulos/autenticacion/api";
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
  const modoUsuarioFinal = useVistaUsuarioFinal();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const { tenant: tenantActivo } = useTenantActivo();
  const { espacioId, establecerEspacioId } = useFiltroEspacioConPersistencia(
    tenantActivo?.id,
  );
  const espacioFiltrado = espacioId.trim() || undefined;
  const [idEjecutando, setIdEjecutando] = useState<string | null>(null);
  const [autorFiltrado, setAutorFiltrado] = useState<string>("");

  const { data: sesionInfo } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    staleTime: 5 * 60 * 1000,
  });

  const usuarioId = sesionInfo?.usuario?.id || sesionInfo?.identidad?.id;
  const usuarioNombre =
    sesionInfo?.usuario?.nombre ||
    sesionInfo?.identidad?.nombreQlik ||
    sesionInfo?.usuario?.correo ||
    "";

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

  const listaBruta = automatizaciones ?? [];

  const autoresDisponibles = Array.from(
    new Set(
      listaBruta
        .map((a) => obtenerAutorReporte(a))
        .filter((n): n is string => Boolean(n) && n !== "Sin propietario"),
    ),
  ).map((nombre) => ({ id: nombre, nombre }));

  const listaFiltrada = listaBruta.filter((auto) => {
    const autorResuelto = obtenerAutorReporte(auto);
    if (modoUsuarioFinal) {
      if (!usuarioId && !usuarioNombre) return true;
      const coincidePropietarioId = Boolean(
        usuarioId && auto.propietarioId === usuarioId,
      );
      const coincidePropietarioNombre = Boolean(
        usuarioNombre &&
          (auto.propietarioNombre === usuarioNombre ||
            autorResuelto.toLowerCase().includes(usuarioNombre.toLowerCase())),
      );
      const coincideEnNombreReporte = Boolean(
        usuarioNombre &&
          auto.nombre.toLowerCase().includes(usuarioNombre.toLowerCase()),
      );
      return (
        coincidePropietarioId ||
        coincidePropietarioNombre ||
        coincideEnNombreReporte
      );
    }
    if (autorFiltrado) {
      return (
        auto.propietarioId === autorFiltrado ||
        auto.propietarioNombre === autorFiltrado ||
        autorResuelto === autorFiltrado
      );
    }
    return true;
  });

  const {
    paginaActual,
    totalPaginas,
    elementosPagina: automatizacionesPaginados,
    irPagina,
    reset: reiniciarPaginacion,
  } = usePaginacion(listaFiltrada);

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
        autores={autoresDisponibles}
        autorFiltrado={autorFiltrado}
        onAutorChange={(autor) => {
          setAutorFiltrado(autor);
          reiniciarPaginacion();
        }}
        mostrarFiltroAutor={!modoUsuarioFinal}
        totalResultados={listaFiltrada.length}
      />

      <div className="space-y-4">
        <ListaAutomatizaciones
          automatizaciones={automatizacionesPaginados}
          idEjecutando={idEjecutando}
          espacioFiltrado={espacioFiltrado}
          targetHost={tenantActivo?.host}
          hayFiltros={Boolean(espacioFiltrado || busquedaActiva || autorFiltrado)}
          onEjecutar={(id) => ejecutar.mutate(id)}
        />

        {listaFiltrada.length > 0 && (
          <PaginacionLista
            paginaActual={paginaActual}
            totalPaginas={totalPaginas}
            onIrPagina={irPagina}
            inicio={inicio}
            total={listaFiltrada.length}
          />
        )}
      </div>
    </PageLayout>
  );
}

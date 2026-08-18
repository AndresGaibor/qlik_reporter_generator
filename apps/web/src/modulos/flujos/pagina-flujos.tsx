import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { ModalSeleccionarTenantQlik } from "@/compartido/componentes/ui/modal-seleccionar-tenant-qlik";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useBusqueda } from "@/compartido/hooks/use-busqueda";
import { useFiltroEspacioConPersistencia } from "@/compartido/hooks/use-filtro-espacio-con-persistencia";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { usePaginacion } from "@/compartido/hooks/use-paginacion";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { construirUrlCrearFlujoQlik } from "@/compartido/utiles/qlik-urls";
import {
  type ResumenFlujo,
  obtenerDataflowBase,
  obtenerEspacios,
  obtenerFlujosConFiltros,
} from "@/modulos/flujos/api";
import {
  type ResumenAutomatizacion,
  obtenerAutomatizaciones,
} from "@/modulos/reportes/api";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BarraFiltrosFlujos } from "./componentes/barra-filtros-flujos";
import { ListaFlujos } from "./componentes/lista-flujos";
import { ModalCrearDataflowDesdePlantilla } from "./componentes/modal-crear-dataflow-desde-plantilla";

export function PaginaFlujos() {
  const { mostrarError } = useNotificaciones();
  const {
    tenant: tenantActivo,
    tenants,
    haySesion,
    sinTenantsDisponibles,
  } = useTenantActivo();
  const { espacioId, establecerEspacioId } = useFiltroEspacioConPersistencia(
    tenantActivo?.id,
  );
  const espacioFiltrado = espacioId.trim() || undefined;
  const [modalTenantsAbierto, setModalTenantsAbierto] = useState(false);
  const [modalCopiaAbierto, setModalCopiaAbierto] = useState(false);
  const { busquedaTemp, setBusquedaTemp, busquedaActiva, buscar, limpiar } =
    useBusqueda();

  const {
    data: flujos,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ResumenFlujo[]>({
    queryKey: ["flujos", tenantActivo?.id, espacioFiltrado, busquedaActiva],
    queryFn: () => obtenerFlujosConFiltros(espacioFiltrado, busquedaActiva),
    retry: false,
  });

  const { data: automatizaciones = [] } = useQuery<ResumenAutomatizacion[]>({
    queryKey: ["automatizaciones", tenantActivo?.id],
    queryFn: obtenerAutomatizaciones,
    retry: false,
  });

  const espacios = useQuery({
    queryKey: ["flujos", "espacios", tenantActivo?.id],
    queryFn: obtenerEspacios,
    retry: false,
  });

  const dataflowBase = useQuery({
    queryKey: ["dataflow-base", tenantActivo?.id],
    queryFn: obtenerDataflowBase,
    retry: false,
  });

  const { manejar } = useManejoError(mostrarError);

  const handleRefetch = () => refetch();

  useEffect(() => {
    if (isError) {
      manejar(error);
    }
  }, [isError, error, manejar]);

  const {
    paginaActual,
    totalPaginas,
    elementosPagina: flujosPaginados,
    irPagina,
  } = usePaginacion(flujos ?? []);

  if (!haySesion) {
    return <EstadoCarga mensaje="Cargando sesión..." />;
  }

  if (sinTenantsDisponibles) {
    return (
      <PageLayout>
        <EstadoError
          tipo="general"
          mensaje="No tienes ningún entorno Qlik configurado. Contacta al administrador."
        />
      </PageLayout>
    );
  }

  if (isLoading) {
    return <EstadoCarga mensaje="Cargando flujos de datos..." />;
  }

  if (isError) {
    return <EstadoError mensaje={error.message} onReintentar={handleRefetch} />;
  }

  const targetHost = tenantActivo?.host;
  const targetUrlCrear = targetHost
    ? construirUrlCrearFlujoQlik(targetHost, espacioId)
    : "#";

  return (
    <PageLayout>
      <PageHeader
        title="Dataflows de Qlik"
        description="Revisa los Dataflows que ya conectaste desde Qlik Cloud, mira cómo se transforman tus datos, y crea una automatización en un par de clics."
        actions={
          tenants.length > 1 ? (
            <Button onClick={() => setModalTenantsAbierto(true)}>
              Crear flujo en Qlik Cloud
            </Button>
          ) : targetHost ? (
            <Button asChild>
              <a
                href={targetUrlCrear}
                target="_blank"
                rel="noopener noreferrer"
              >
                Crear flujo en Qlik Cloud
              </a>
            </Button>
          ) : null
        }
      />

      <section className="mb-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-900">
            Crear Dataflow desde la plantilla base
          </p>
          <p className="mt-1 text-xs text-brand-800">
            Primero se copiará {dataflowBase.data?.nombre ? `“${dataflowBase.data.nombre}”` : "la plantilla"}.
            Después podrás abrir la copia confirmada para editarla en Qlik.
          </p>
        </div>
        {targetHost && dataflowBase.data ? (
          <Button
            className="mt-3 w-full sm:mt-0 sm:w-auto"
            onClick={() => setModalCopiaAbierto(true)}
          >
            Crear copia
          </Button>
        ) : (
          <p className="mt-3 text-xs font-medium text-brand-800 sm:mt-0">
            {dataflowBase.isLoading
              ? "Consultando plantilla…"
              : "No hay una plantilla base disponible"}
          </p>
        )}
      </section>

      <BarraFiltrosFlujos
        busquedaTemp={busquedaTemp}
        setBusquedaTemp={setBusquedaTemp}
        buscar={buscar}
        limpiar={limpiar}
        espacios={espacios.data ?? []}
        errorEspacios={espacios.isError}
        espacioFiltrado={espacioFiltrado}
        onEspacioChange={establecerEspacioId}
      />

      <ListaFlujos
        flujos={flujosPaginados}
        automatizaciones={automatizaciones}
        targetHost={targetHost}
        espacioId={espacioId}
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        onPageChange={irPagina}
        total={flujos?.length ?? 0}
        hayFiltros={Boolean(espacioFiltrado || busquedaActiva)}
      />

      <ModalSeleccionarTenantQlik
        abierto={modalTenantsAbierto}
        onCerrar={() => setModalTenantsAbierto(false)}
        tenants={tenants}
        tenantActivoId={tenantActivo?.id}
        espacioId={espacioId}
      />
      {targetHost && dataflowBase.data ? (
        <ModalCrearDataflowDesdePlantilla
          abierto={modalCopiaAbierto}
          nombrePlantilla={dataflowBase.data.nombre}
          host={targetHost}
          onCerrar={() => setModalCopiaAbierto(false)}
          onCreado={() => void refetch()}
        />
      ) : null}
    </PageLayout>
  );
}

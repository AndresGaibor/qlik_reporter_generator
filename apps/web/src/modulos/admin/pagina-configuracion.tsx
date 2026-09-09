import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import { useQuery } from "@tanstack/react-query";
import { PaginaDetalleTenant } from "./pagina-detalle-tenant";

export function PaginaConfiguracion() {
  const sesion = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    retry: false,
  });

  if (sesion.isLoading) {
    return <EstadoCarga mensaje="Cargando configuración..." />;
  }

  if (sesion.isError) {
    return (
      <EstadoError
        mensaje="No pudimos cargar la configuración de la plataforma."
        onReintentar={() => sesion.refetch()}
      />
    );
  }

  const tenantActivo = sesion.data?.tenantsDisponibles.find(
    (tenant) => tenant.id === sesion.data?.tenantActivoId,
  );
  const organizacionId =
    tenantActivo?.organizacionId ??
    sesion.data?.tenantsDisponibles[0]?.organizacionId;

  if (!organizacionId) {
    return (
      <PageLayout>
        <div className="rounded-lg border border-danger-200 bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-semibold text-ink-900">
            No encontramos la configuración inicial
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Revisa el proceso de instalación de la plataforma antes de
            continuar.
          </p>
        </div>
      </PageLayout>
    );
  }

  return <PaginaDetalleTenant tenantId={organizacionId} modoConfiguracion />;
}

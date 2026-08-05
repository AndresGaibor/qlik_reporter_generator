import { obtenerSesion } from "@/modulos/autenticacion/api";
import type { TenantSesionDisponible } from "@qlik/contratos/autenticacion";
import { useQuery } from "@tanstack/react-query";

export interface TenantActivoResultado {
  tenant: TenantSesionDisponible | undefined;
  tenants: TenantSesionDisponible[];
  haySesion: boolean;
  sinTenantsDisponibles: boolean;
}

export function useTenantActivo(): TenantActivoResultado {
  const { data: sesion, isLoading } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    staleTime: 5 * 60 * 1000,
  });

  const tenants: TenantSesionDisponible[] = sesion?.tenantsDisponibles ?? [];
  const haySesion = !isLoading && sesion !== undefined;
  const sinTenantsDisponibles = haySesion && tenants.length === 0;

  const activo =
    tenants.find((t) => t.id === sesion?.tenantActivoId) ?? tenants[0];

  return { tenant: activo, tenants, haySesion, sinTenantsDisponibles };
}

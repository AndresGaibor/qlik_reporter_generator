import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import {
  type AnyRoute,
  createRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { PaginaSuperadmins } from "./PaginaSuperadmins";
import { PaginaConfiguracion } from "./pagina-configuracion";

function RedireccionConfiguracion() {
  const navegar = useNavigate();

  useEffect(() => {
    navegar({ to: "/configuracion", replace: true });
  }, [navegar]);

  return <EstadoCarga mensaje="Abriendo configuración..." />;
}

export function crearRutasAdmin(rutaRaiz: AnyRoute) {
  const configuracion = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/configuracion",
    component: PaginaConfiguracion,
  });

  const listadoHeredado = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/admin/tenants",
    component: RedireccionConfiguracion,
  });

  const detalleHeredado = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/admin/tenants/$tenantId",
    component: RedireccionConfiguracion,
  });

  const superadmins = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/admin/superadmins",
    component: PaginaSuperadmins,
  });

  return [configuracion, listadoHeredado, detalleHeredado, superadmins];
}

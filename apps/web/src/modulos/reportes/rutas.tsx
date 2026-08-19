import {
  type AnyRoute,
  createRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { PaginaDetalleReporte } from "./pagina-detalle-reporte";
import { PaginaReportes } from "./pagina-reportes";

function RedirigirNueva() {
  const navegar = useNavigate();
  useEffect(() => {
    void navegar({ to: "/reportes", replace: true });
  }, [navegar]);
  return null;
}

export function crearRutasReportes(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/reportes",
      component: PaginaReportes,
    }),
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/reportes/nueva",
      component: RedirigirNueva,
    }),
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/reportes/$id",
      component: function RutaDetalleReporte() {
        const { id } = useParams({ strict: false }) as { id: string };
        return <PaginaDetalleReporte id={id} />;
      },
    }),
  ];
}

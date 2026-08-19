import { type AnyRoute, createRoute, useParams } from "@tanstack/react-router";
import { PaginaDetalleReporte } from "./pagina-detalle-reporte";
import { PaginaNuevoReporte } from "./pagina-nuevo-reporte";
import { PaginaReportes } from "./pagina-reportes";

export function crearRutasReportes(rutaRaiz: AnyRoute) {
  const listado = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes",
    component: PaginaReportes,
  });
  const nueva = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes/nueva",
    component: PaginaNuevoReporte,
  });
  const detalle = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes/$id",
    component: function RutaDetalleReporte() {
      const { id } = useParams({ strict: false }) as { id: string };
      return <PaginaDetalleReporte id={id} />;
    },
  });
  return [listado, nueva, detalle];
}

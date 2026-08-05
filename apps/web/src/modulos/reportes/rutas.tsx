import { type AnyRoute, createRoute, useParams } from "@tanstack/react-router";
import { PaginaAutomatizaciones } from "./pagina-automatizaciones";
import { PaginaDetalleAutomatizacion } from "./pagina-detalle-automatizacion";
import { PaginaNuevaAutomatizacion } from "./pagina-nueva-automatizacion";

export function crearRutasReportes(rutaRaiz: AnyRoute) {
  const listado = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes",
    component: PaginaAutomatizaciones,
  });
  const nueva = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes/nueva",
    component: PaginaNuevaAutomatizacion,
  });
  const detalle = createRoute({
    getParentRoute: () => rutaRaiz,
    path: "/reportes/$id",
    component: function RutaDetalleAutomatizacion() {
      const { id } = useParams({ strict: false }) as { id: string };
      return <PaginaDetalleAutomatizacion id={id} />;
    },
  });
  return [listado, nueva, detalle];
}

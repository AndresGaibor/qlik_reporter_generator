import {
  type AnyRoute,
  createRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { PaginaDetalleReporte } from "./pagina-detalle-reporte";
import { PaginaReportes } from "./pagina-reportes";

export function crearRutasReportes(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/reportes",
      component: PaginaReportes,
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

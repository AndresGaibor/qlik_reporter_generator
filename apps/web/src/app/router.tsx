import { EstadoRuta } from "@/compartido/componentes/feedback/estado-ruta";
import { crearRutasAdmin } from "@/modulos/admin/publico";
import { crearRutasAutenticacion } from "@/modulos/autenticacion/publico";
import { crearRutasFlujos } from "@/modulos/flujos/publico";
import { crearRutasInicio } from "@/modulos/inicio/publico";
import { crearRutasReportes } from "@/modulos/reportes/publico";
import { crearRutasSetup } from "@/modulos/setup/publico";
import { crearRutasTablas } from "@/modulos/tablas/rutas";
import { createRootRoute, createRouter } from "@tanstack/react-router";
import { LayoutPrincipal } from "./layout-principal";

const rutaRaiz = createRootRoute({
  component: LayoutPrincipal,
  notFoundComponent: () => <EstadoRuta tipo="no-encontrada" />,
  errorComponent: ({ reset }) => (
    <EstadoRuta tipo="error" onReintentar={reset} />
  ),
});
const arbolRutas = rutaRaiz.addChildren([
  ...crearRutasInicio(rutaRaiz),
  ...crearRutasAutenticacion(rutaRaiz),
  ...crearRutasFlujos(rutaRaiz),
  ...crearRutasReportes(rutaRaiz),
  ...crearRutasTablas(rutaRaiz),
  ...crearRutasAdmin(rutaRaiz),
  ...crearRutasSetup(rutaRaiz),
]);

export const router = createRouter({ routeTree: arbolRutas });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

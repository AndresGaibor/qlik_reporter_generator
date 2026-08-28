import { type AnyRoute, createRoute } from "@tanstack/react-router";
import { PaginaAdministracionDescargas } from "./pagina-administracion-descargas";
import { PaginaDescargas } from "./pagina-descargas";

export function crearRutasDescargas(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/descargas",
      component: PaginaDescargas,
    }),
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/descargas/administracion",
      component: PaginaAdministracionDescargas,
    }),
  ];
}

import { type AnyRoute, createRoute } from "@tanstack/react-router";
import { PaginaAdministracionDescargas } from "./pagina-administracion-descargas";
import { PaginaDescargasSemantica } from "./pagina-descargas-semantica";

export function crearRutasDescargas(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/descargas",
      component: PaginaDescargasSemantica,
    }),
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/descargas/administracion",
      component: PaginaAdministracionDescargas,
    }),
  ];
}

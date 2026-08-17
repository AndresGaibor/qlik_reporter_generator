import { type AnyRoute, createRoute } from "@tanstack/react-router";
import { PaginaDescargas } from "./pagina-descargas";

export function crearRutasDescargas(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/descargas",
      component: PaginaDescargas,
    }),
  ];
}

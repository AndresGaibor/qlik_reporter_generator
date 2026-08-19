import {
  type AnyRoute,
  createRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";

function RedirigirFlujos() {
  const navegar = useNavigate();
  useEffect(() => {
    void navegar({ to: "/reportes", replace: true });
  }, [navegar]);
  return null;
}

function RedirigirDetalleFlujo() {
  const navegar = useNavigate();
  const { id } = useParams({ strict: false }) as { id: string };
  useEffect(() => {
    void navegar({ to: "/reportes/$id", params: { id }, replace: true });
  }, [id, navegar]);
  return null;
}

export function crearRutasFlujos(rutaRaiz: AnyRoute) {
  return [
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/flujos",
      component: RedirigirFlujos,
    }),
    createRoute({
      getParentRoute: () => rutaRaiz,
      path: "/flujos/$id",
      component: RedirigirDetalleFlujo,
    }),
  ];
}

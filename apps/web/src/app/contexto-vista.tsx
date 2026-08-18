import { createContext, useContext } from "react";

export interface ContextoVista {
  modoUsuarioFinal: boolean;
  esAdmin: boolean;
}

export const VistaContext = createContext<ContextoVista>({
  modoUsuarioFinal: false,
  esAdmin: false,
});

export function useContextoVista() {
  return useContext(VistaContext);
}

export function useVistaUsuarioFinal() {
  return useContextoVista().modoUsuarioFinal;
}

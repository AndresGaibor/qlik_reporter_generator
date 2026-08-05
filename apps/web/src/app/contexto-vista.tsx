import { createContext, useContext } from "react";

export interface ContextoVista {
  modoUsuarioFinal: boolean;
}

export const VistaContext = createContext<ContextoVista>({
  modoUsuarioFinal: false,
});

export function useVistaUsuarioFinal() {
  return useContext(VistaContext).modoUsuarioFinal;
}

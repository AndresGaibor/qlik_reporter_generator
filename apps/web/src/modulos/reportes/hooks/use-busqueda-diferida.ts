import { useEffect } from "react";

export function useBusquedaDiferida(
  valor: string,
  onCambiar: (valor: string) => void,
  retraso = 350,
) {
  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      onCambiar(valor.trim());
    }, retraso);

    return () => window.clearTimeout(temporizador);
  }, [valor, onCambiar, retraso]);
}

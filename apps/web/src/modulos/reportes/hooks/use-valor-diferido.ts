import { useEffect, useState } from "react";

export function useValorDiferido<T>(valor: T, retraso = 450) {
  const [diferido, setDiferido] = useState(valor);

  useEffect(() => {
    const temporizador = window.setTimeout(() => setDiferido(valor), retraso);
    return () => window.clearTimeout(temporizador);
  }, [retraso, valor]);

  return diferido;
}
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { EstadoResultados } from "./estado-resultados";

interface Props {
  sesion: boolean;
  sinEntornos: boolean;
}

export function EstadoAccesoResultados({ sesion, sinEntornos }: Props) {
  if (!sesion) {
    return <EstadoCarga mensaje="Cargando sesión…" />;
  }

  if (sinEntornos) {
    return (
      <EstadoResultados
        tipo="sin-conexion"
        mensaje="No tienes ningún entorno Qlik configurado. Contacta al administrador."
      />
    );
  }

  return null;
}

import { ErrorClienteApi } from "@/compartido/api/cliente";

export type CategoriaError =
  | "conexion"
  | "sesion"
  | "permisos"
  | "validacion"
  | "no-encontrado"
  | "general";

export interface ErrorNormalizado {
  mensaje: string;
  categoria: CategoriaError;
}

const MENSAJES_POR_CATEGORIA: Record<CategoriaError, string> = {
  conexion:
    "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
  sesion: "Tu sesión expiró. Inicia sesión nuevamente.",
  permisos:
    "No tienes permisos para realizar esta acción.",
  validacion:
    "Revisa los datos ingresados e intenta nuevamente.",
  "no-encontrado":
    "El recurso solicitado ya no está disponible.",
  general:
    "Ocurrió un problema inesperado. Intenta nuevamente.",
};

function clasificarError(error: ErrorClienteApi): CategoriaError {
  if (error.estado === 0 || error.estado === 502 || error.estado === 503)
    return "conexion";
  if (error.estado === 401) return "sesion";
  if (error.estado === 403) return "permisos";
  if (error.estado === 404) return "no-encontrado";
  if (error.estado === 400 || error.estado === 422) return "validacion";
  return "general";
}

export function normalizarError(error: unknown): ErrorNormalizado {
  if (error instanceof ErrorClienteApi) {
    const categoria = clasificarError(error);
    return {
      mensaje: MENSAJES_POR_CATEGORIA[categoria],
      categoria,
    };
  }
  return {
    mensaje: MENSAJES_POR_CATEGORIA["general"],
    categoria: "general",
  };
}

type Notificador = (error: unknown) => void;
const notificadores = new Set<Notificador>();

export function registrarNotificadorErrores(
  notificar: Notificador,
): () => void {
  notificadores.add(notificar);
  return () => notificadores.delete(notificar);
}

export function notificarErrorNoControlado(error: unknown): void {
  for (const notificar of notificadores) {
    notificar(error);
  }
}

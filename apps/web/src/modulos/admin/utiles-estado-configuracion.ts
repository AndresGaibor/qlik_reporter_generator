export type IdSeccionConfiguracion =
  | "general"
  | "qlik"
  | "oauth"
  | "plantilla"
  | "bigquery"
  | "usuarios";

export type TonoEstadoConfiguracion =
  | "exito"
  | "pendiente"
  | "error"
  | "neutral";

export interface ItemResumenConfiguracion {
  id: IdSeccionConfiguracion;
  etiqueta: string;
  estado: string;
  completo: boolean;
  tono: TonoEstadoConfiguracion;
  detalle?: string;
}

interface ParametrosResumenConfiguracion {
  empresaActiva: boolean;
  cantidadUsuarios: number;
  qlik: { conectado: boolean; host?: string };
  oauth: { estado?: string | null };
  plantilla: { configurada: boolean; nombre?: string | null };
  bigQuery: { estado?: string; dataset?: string };
}

function estadoOauth(estado?: string | null) {
  if (estado === "verificada")
    return { estado: "Verificado", completo: true, tono: "exito" as const };
  if (estado === "error")
    return { estado: "Con error", completo: false, tono: "error" as const };
  if (estado === "pendiente")
    return {
      estado: "Por verificar",
      completo: false,
      tono: "pendiente" as const,
    };
  return { estado: "Pendiente", completo: false, tono: "pendiente" as const };
}

export function crearResumenConfiguracion(
  parametros: ParametrosResumenConfiguracion,
): ItemResumenConfiguracion[] {
  const oauth = estadoOauth(parametros.oauth.estado);
  const bigQueryError = parametros.bigQuery.estado === "error";
  const bigQueryActiva = parametros.bigQuery.estado === "activo";
  const usuarios = parametros.cantidadUsuarios;

  return [
    {
      id: "general",
      etiqueta: "General",
      estado: parametros.empresaActiva ? "Activa" : "Suspendida",
      completo: parametros.empresaActiva,
      tono: parametros.empresaActiva ? "exito" : "error",
    },
    {
      id: "qlik",
      etiqueta: "Qlik Cloud",
      estado: parametros.qlik.conectado ? "Conectado" : "Pendiente",
      completo: parametros.qlik.conectado,
      tono: parametros.qlik.conectado ? "exito" : "pendiente",
      detalle: parametros.qlik.host,
    },
    {
      id: "oauth",
      etiqueta: "OAuth",
      ...oauth,
    },
    {
      id: "plantilla",
      etiqueta: "Plantilla base",
      estado: parametros.plantilla.configurada ? "Configurada" : "Pendiente",
      completo: parametros.plantilla.configurada,
      tono: parametros.plantilla.configurada ? "exito" : "pendiente",
      detalle: parametros.plantilla.nombre ?? undefined,
    },
    {
      id: "bigquery",
      etiqueta: "BigQuery",
      estado: bigQueryError
        ? "Con error"
        : bigQueryActiva
          ? "Conectada"
          : "Pendiente",
      completo: bigQueryActiva,
      tono: bigQueryError ? "error" : bigQueryActiva ? "exito" : "pendiente",
      detalle: parametros.bigQuery.dataset,
    },
    {
      id: "usuarios",
      etiqueta: "Usuarios",
      estado:
        usuarios === 0
          ? "Sin usuarios"
          : `${usuarios} ${usuarios === 1 ? "autorizado" : "autorizados"}`,
      completo: usuarios > 0,
      tono: usuarios > 0 ? "exito" : "pendiente",
    },
  ];
}

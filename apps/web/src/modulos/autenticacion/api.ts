import { clienteApi } from "@/compartido/api/cliente";
import type {
  SesionPublica,
  TenantSesionDisponible,
} from "@qlik/contratos/autenticacion";

export function obtenerSesion() {
  return clienteApi.get<SesionPublica>("/auth/qlik/sesion");
}

export function cerrarSesion() {
  return clienteApi.post<{ cerrada: true }>("/auth/qlik/cerrar-sesion");
}

export function obtenerTenantsSesion() {
  return clienteApi.get<TenantSesionDisponible[]>("/auth/qlik/sesion/tenants");
}

export function cambiarTenantActivo(tenantQlikId: string) {
  return clienteApi.put<{ cambiado: true }>("/auth/qlik/sesion/tenant-activo", {
    tenantQlikId,
  });
}

interface RespuestaIniciarSesion {
  exito: boolean;
  datos?: { url: string };
  error?: { mensaje: string };
}

const MENSAJE_API_NO_DISPONIBLE =
  "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.";

async function solicitarInicioSesion(
  ruta: string,
): Promise<RespuestaIniciarSesion> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error(MENSAJE_API_NO_DISPONIBLE);
  }

  const contenido = await respuesta.text();
  if (!respuesta.ok || !contenido.trim()) {
    throw new Error(MENSAJE_API_NO_DISPONIBLE);
  }

  try {
    return JSON.parse(contenido) as RespuestaIniciarSesion;
  } catch {
    throw new Error(MENSAJE_API_NO_DISPONIBLE);
  }
}

export async function iniciarSesion(
  host: string,
): Promise<RespuestaIniciarSesion> {
  return solicitarInicioSesion(
    `/api/auth/qlik/iniciar?host=${encodeURIComponent(host)}&format=json`,
  );
}

export async function iniciarSesionPorCorreo(
  correo: string,
): Promise<RespuestaIniciarSesion> {
  return solicitarInicioSesion(
    `/api/auth/qlik/iniciar-por-correo?correo=${encodeURIComponent(correo)}&format=json`,
  );
}

export async function iniciarVerificacionOauth(
  host: string,
  retorno: string,
): Promise<RespuestaIniciarSesion> {
  const parametros = new URLSearchParams({
    host,
    retorno,
    format: "json",
  });
  return solicitarInicioSesion(
    `/api/auth/qlik/iniciar?${parametros.toString()}`,
  );
}

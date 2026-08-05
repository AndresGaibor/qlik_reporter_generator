import type { RespuestaApi } from "@qlik/contratos/comun";

interface ConfiguracionSolicitud extends RequestInit {
  parametros?: Record<string, string | number | boolean | undefined>;
}

export class ErrorClienteApi extends Error {
  constructor(
    mensaje: string,
    public readonly estado: number,
    public readonly codigo?: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorClienteApi";
  }
}

const MENSAJES_ERROR_HTTP: Record<number, string> = {
  400: "Los datos enviados no son válidos.",
  401: "Tu sesión expiró. Por favor inicia sesión nuevamente.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El recurso que buscas no fue encontrado.",
  409: "Ya existe un registro con estos datos.",
  422: "Los datos proporcionados no pudieron ser procesados.",
  429: "Has realizado demasiadas solicitudes. Espera un momento.",
  500: "El servidor tuvo un problema. Por favor intenta más tarde.",
  502: "El servidor no responde correctamente.",
  503: "El servicio está temporalmente unavailable.",
};

function mensajeAmigable(
  estado: number,
  mensajeOriginal?: string,
  codigo?: string,
  detalles?: unknown,
): string {
  if (codigo?.includes("HTTP-429") || estado === 429) {
    const retryAfter = (detalles as { retryAfterSeconds?: number })
      ?.retryAfterSeconds;
    if (retryAfter) {
      return `Has realizado demasiadas solicitudes. Espera ${retryAfter} segundo${retryAfter === 1 ? "" : "s"} antes de intentar nuevamente.`;
    }
    return "Has realizado demasiadas solicitudes. Espera un momento antes de intentar nuevamente.";
  }

  if (codigo?.includes("QLIK_")) {
    const codigoQlik = codigo.replace("QLIK_", "");
    if (codigoQlik === "INSUFFICIENT_SCOPE" || codigoQlik === "ACCESS_DENIED") {
      return "No tienes permisos para realizar esta operación. Contacta al administrador.";
    }
    if (codigoQlik === "INVALID_TOKEN" || codigoQlik === "401") {
      return "Tu sesión en Qlik expiró. Por favor inicia sesión nuevamente.";
    }
    if (codigoQlik === "RESOURCE_NOT_FOUND" || codigoQlik === "404") {
      return "El recurso no fue encontrado en Qlik.";
    }
  }

  if (mensajeOriginal && mensajeOriginal.length > 10) {
    return mensajeOriginal;
  }
  return (
    MENSAJES_ERROR_HTTP[estado] ??
    `Ocurrió un error (${estado}). Por favor intenta nuevamente.`
  );
}

export class ClienteApi {
  private _onUnauthorized?: () => void;

  constructor(private readonly baseUrl = "/api") {}

  set onUnauthorized(fn: (() => void) | undefined) {
    this._onUnauthorized = fn;
  }

  get<T>(ruta: string, configuracion?: ConfiguracionSolicitud): Promise<T> {
    return this.solicitar<T>(ruta, { ...configuracion, method: "GET" });
  }

  post<T>(
    ruta: string,
    datos?: unknown,
    configuracion?: ConfiguracionSolicitud,
  ): Promise<T> {
    return this.solicitar<T>(ruta, {
      ...configuracion,
      method: "POST",
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  }

  put<T>(
    ruta: string,
    datos?: unknown,
    configuracion?: ConfiguracionSolicitud,
  ): Promise<T> {
    return this.solicitar<T>(ruta, {
      ...configuracion,
      method: "PUT",
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  }

  patch<T>(
    ruta: string,
    datos?: unknown,
    configuracion?: ConfiguracionSolicitud,
  ): Promise<T> {
    return this.solicitar<T>(ruta, {
      ...configuracion,
      method: "PATCH",
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  }

  delete<T>(ruta: string, configuracion?: ConfiguracionSolicitud): Promise<T> {
    return this.solicitar<T>(ruta, { ...configuracion, method: "DELETE" });
  }

  private async solicitar<T>(
    ruta: string,
    configuracion: ConfiguracionSolicitud,
  ): Promise<T> {
    const { parametros = {}, ...opcionesFetch } = configuracion;
    const origen = globalThis.location?.origin ?? "http://localhost";
    const url = new URL(`${this.baseUrl}${ruta}`, origen);
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== undefined) url.searchParams.set(clave, String(valor));
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        ...opcionesFetch,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(opcionesFetch.body ? { "Content-Type": "application/json" } : {}),
          ...opcionesFetch.headers,
        },
      });
    } catch (errorRed) {
      if (errorRed instanceof TypeError && errorRed.message.includes("fetch")) {
        throw new ErrorClienteApi(
          "No se pudo conectar con el servidor. Verifica tu conexión a internet.",
          0,
          "NETWORK_ERROR",
        );
      }
      throw new ErrorClienteApi(
        "Ocurrió un error al realizar la solicitud.",
        0,
        "UNKNOWN_NETWORK_ERROR",
      );
    }

    const contenido = await leerRespuesta<T>(respuesta);

    if (!respuesta.ok || !contenido.exito) {
      const error = contenido.exito
        ? { mensaje: undefined, codigo: undefined, detalles: undefined }
        : contenido.error;
      const mensajeFinal = mensajeAmigable(
        respuesta.status,
        error.mensaje,
        error.codigo,
        error.detalles,
      );
      if (respuesta.status === 401) {
        this._onUnauthorized?.();
      }
      throw new ErrorClienteApi(
        mensajeFinal,
        respuesta.status,
        error.codigo,
        error.detalles,
      );
    }
    return contenido.datos;
  }
}

async function leerRespuesta<T>(respuesta: Response): Promise<RespuestaApi<T>> {
  const contenidoTexto = await respuesta.text();
  if (!contenidoTexto.trim()) {
    if (respuesta.ok) {
      throw new ErrorClienteApi(
        "El servidor devolvió una respuesta vacía.",
        respuesta.status,
        "RESPUESTA_VACIA",
      );
    }
    throw new ErrorClienteApi(
      mensajeAmigable(respuesta.status),
      respuesta.status,
      "RESPUESTA_ERROR_VACIA",
    );
  }
  try {
    return JSON.parse(contenidoTexto) as RespuestaApi<T>;
  } catch {
    throw new ErrorClienteApi(
      `El servidor devolvió una respuesta inválida (${respuesta.status}).`,
      respuesta.status,
      "RESPUESTA_INVALIDA",
    );
  }
}

export const clienteApi = new ClienteApi();

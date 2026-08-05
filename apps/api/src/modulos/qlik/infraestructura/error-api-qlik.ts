export class ErrorApiQlik extends Error {
  public readonly codigoError: string | undefined;
  public readonly retryAfter: number | undefined;

  constructor(
    public readonly estadoHttp: number,
    public readonly estadoTexto: string,
    public readonly ruta: string,
    public readonly cuerpo?: unknown,
    public readonly trazaId?: string,
    retryAfter?: number,
  ) {
    const {
      mensaje,
      codigo,
      retryAfter: retryFromBody,
    } = analizarCuerpo(cuerpo, estadoHttp);
    super(mensaje);
    this.name = "ErrorApiQlik";
    this.codigoError = codigo;
    this.retryAfter = retryAfter ?? retryFromBody;
  }

  get mensajeParaUsuario(): string {
    return traducirErrorQlik(this.estadoHttp, this.codigoError, this.message);
  }
}

interface ResultadoAnalisis {
  mensaje: string;
  codigo: string | undefined;
  retryAfter: number | undefined;
}

function analizarCuerpo(cuerpo: unknown, estado: number): ResultadoAnalisis {
  const retryAfter = extraerRetryAfter(cuerpo);
  const detalle = extraerMensajeCuerpo(cuerpo);
  const codigo = extraerCodigoError(cuerpo);

  if (detalle) {
    return { mensaje: detalle, codigo, retryAfter };
  }

  return {
    mensaje: mensajePorDefecto(estado, codigo),
    codigo,
    retryAfter,
  };
}

function extraerRetryAfter(cuerpo: unknown): number | undefined {
  if (!cuerpo || typeof cuerpo !== "object") return undefined;
  const objeto = cuerpo as Record<string, unknown>;
  if (typeof objeto["retry-after"] === "number") {
    return objeto["retry-after"] as number;
  }
  const errores = objeto.errors;
  if (Array.isArray(errores) && errores.length > 0) {
    const primero = errores[0] as Record<string, unknown>;
    if (typeof primero["retry-after"] === "number") {
      return primero["retry-after"] as number;
    }
  }
  return undefined;
}

function extraerCodigoError(cuerpo: unknown): string | undefined {
  if (!cuerpo || typeof cuerpo !== "object") return undefined;
  const objeto = cuerpo as Record<string, unknown>;
  const errores = objeto.errors;
  if (Array.isArray(errores) && errores.length > 0) {
    const primero = errores[0] as Record<string, unknown>;
    if (typeof primero.code === "string") {
      return primero.code;
    }
  }
  return undefined;
}

function extraerMensajeCuerpo(cuerpo: unknown): string | undefined {
  if (!cuerpo || typeof cuerpo !== "object") return undefined;
  const objeto = cuerpo as Record<string, unknown>;
  const errores = objeto.errors;
  if (Array.isArray(errores) && errores.length > 0) {
    const primero = errores[0] as Record<string, unknown>;
    const detalle = primero.detail;
    const titulo = primero.title;
    if (typeof detalle === "string" && detalle) return detalle;
    if (typeof titulo === "string" && titulo) return titulo;
  }
  const mensaje = objeto.message ?? objeto.error;
  return typeof mensaje === "string" ? mensaje : undefined;
}

const MENSAJES_QLIK_POR_CODIGO: Record<number, string> = {
  400: "La solicitud a Qlik no es válida. Revisa los datos enviados.",
  401: "Tu sesión en Qlik expiró. Necesitas autenticarte nuevamente.",
  403: "No tienes permisos para realizar esta operación en Qlik. Verifica tus scopes OAuth o que tengas rol de administrador del tenant.",
  404: "El recurso solicitado no existe en Qlik o fue eliminado.",
  409: "Hay un conflicto con el recurso en Qlik. Puede que ya exista.",
  422: "Los datos enviados no pueden ser procesados por Qlik. Verifica la configuración.",
  429: "Se excedió el límite de solicitudes a Qlik. Espera un momento antes de reintentar.",
  500: "Qlik tuvo un error interno. Espera e intenta nuevamente.",
  502: "Qlik no responde correctamente. Espera e intenta nuevamente.",
  503: "El servicio de Qlik no está disponible temporalmente.",
};

const MENSAJES_POR_CODIGO_ERROR: Record<string, string> = {
  "HTTP-429":
    "Has superado el límite de solicitudes a Qlik. Reduce la frecuencia de tus peticiones.",
  IDENTITY_SCOPE_ERROR:
    "Falta el scope de identidad en Qlik Cloud. Agrega 'identity' en los scopes.",
  INSUFFICIENT_SCOPE:
    "Tu token no tiene los permisos necesarios. Solicita los scopes adecuados.",
  RESOURCE_NOT_FOUND: "El recurso no fue encontrado en Qlik.",
  INVALID_TOKEN: "El token de acceso a Qlik es inválido o expiró.",
  ACCESS_DENIED: "No tienes acceso a este recurso en Qlik.",
};

function mensajePorDefecto(estado: number, codigo?: string): string {
  if (codigo && MENSAJES_POR_CODIGO_ERROR[codigo]) {
    return MENSAJES_POR_CODIGO_ERROR[codigo];
  }
  return (
    MENSAJES_QLIK_POR_CODIGO[estado] ?? `Qlik respondió con error ${estado}.`
  );
}

function traducirErrorQlik(
  estado: number,
  codigo: string | undefined,
  mensajeOriginal: string,
): string {
  if (codigo && MENSAJES_POR_CODIGO_ERROR[codigo]) {
    return MENSAJES_POR_CODIGO_ERROR[codigo];
  }
  if (MENSAJES_QLIK_POR_CODIGO[estado]) {
    return MENSAJES_QLIK_POR_CODIGO[estado];
  }
  return mensajeOriginal;
}

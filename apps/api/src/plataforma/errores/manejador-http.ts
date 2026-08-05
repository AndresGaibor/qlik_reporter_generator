import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { ErrorApiQlik } from "../../modulos/qlik/infraestructura/error-api-qlik.js";
import { ErrorAplicacion } from "../../nucleo/errores/error-aplicacion.js";
import { responderError } from "../../nucleo/http/respuestas.js";
import type { Registrador } from "../observabilidad/registrador.js";

export function crearManejadorErrores(registrador: Registrador) {
  return (error: Error, c: Context) => {
    const trazaId = c.req.header("x-request-id");

    if (error instanceof ZodError) {
      const primerError = error.errors[0];
      const mensaje = primerError
        ? `${primerError.path.join(".")}: ${primerError.message}`
        : "Solicitud inválida";
      return responderError(c, mensaje, 400, {
        codigo: "VALIDACION",
        detalles: error.flatten(),
        trazaId,
      });
    }

    if (error instanceof ErrorAplicacion) {
      return responderError(
        c,
        error.message,
        error.estadoHttp as ContentfulStatusCode,
        {
          codigo: error.codigo,
          detalles: error.detalles,
          trazaId,
        },
      );
    }

    if (error instanceof ErrorApiQlik) {
      const estado = error.estadoHttp >= 500 ? 502 : error.estadoHttp;
      registrador.error("integracion.qlik.error", {
        trazaId,
        estadoQlik: error.estadoHttp,
        codigoError: error.codigoError,
        retryAfter: error.retryAfter,
        mensajeOriginal: error.message,
        ruta: error.ruta,
      });
      return responderError(
        c,
        error.mensajeParaUsuario,
        estado as ContentfulStatusCode,
        {
          codigo: error.codigoError ? `QLIK_${error.codigoError}` : "QLIK_API",
          detalles: error.retryAfter
            ? { retryAfterSeconds: error.retryAfter }
            : error.cuerpo,
          trazaId: error.trazaId ?? trazaId,
        },
      );
    }

    registrador.error("http.error-no-controlado", {
      trazaId,
      mensaje: error.message,
      stack: error.stack,
    });

    return responderError(c, "Error interno del servidor", 500, {
      codigo: "INTERNO",
      trazaId,
    });
  };
}

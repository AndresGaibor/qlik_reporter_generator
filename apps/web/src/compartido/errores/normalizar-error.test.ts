/// <reference types="vitest" />
import { describe, expect, it, vi } from "vitest";
import { ErrorClienteApi } from "@/compartido/api/cliente";
import {
  normalizarError,
  notificarErrorNoControlado,
  registrarNotificadorErrores,
} from "./normalizar-error";

describe("normalizarError", () => {
  it("clasifica error de red como conexion", () => {
    const error = new ErrorClienteApi(
      "No se pudo conectar con el servidor.",
      0,
      "NETWORK_ERROR",
    );
    expect(normalizarError(error)).toEqual({
      mensaje: "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
      categoria: "conexion",
    });
  });

  it("clasifica 503 como conexion", () => {
    const error = new ErrorClienteApi("interno", 503);
    expect(normalizarError(error)).toEqual({
      mensaje: "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
      categoria: "conexion",
    });
  });

  it("clasifica 401 como sesion", () => {
    const error = new ErrorClienteApi("Tu sesión expiró.", 401);
    expect(normalizarError(error)).toEqual({
      mensaje: "Tu sesión expiró. Inicia sesión nuevamente.",
      categoria: "sesion",
    });
  });

  it("clasifica 403 como permisos", () => {
    const error = new ErrorClienteApi("Acceso denegado.", 403);
    expect(normalizarError(error)).toEqual({
      mensaje: "No tienes permisos para realizar esta acción.",
      categoria: "permisos",
    });
  });

  it("clasifica 400 como validacion", () => {
    const error = new ErrorClienteApi("Datos inválidos.", 400);
    expect(normalizarError(error)).toEqual({
      mensaje: "Revisa los datos ingresados e intenta nuevamente.",
      categoria: "validacion",
    });
  });

  it("clasifica 404 como no-encontrado", () => {
    const error = new ErrorClienteApi("No encontrado.", 404);
    expect(normalizarError(error)).toEqual({
      mensaje: "El recurso solicitado ya no está disponible.",
      categoria: "no-encontrado",
    });
  });

  it("clasifica excepcion nativa como general", () => {
    const error = new Error("Unexpected end of JSON input");
    expect(normalizarError(error)).toEqual({
      mensaje: "Ocurrió un problema inesperado. Intenta nuevamente.",
      categoria: "general",
    });
  });

  it("clasifica 500 como general", () => {
    const error = new ErrorClienteApi("Error interno.", 500);
    expect(normalizarError(error)).toEqual({
      mensaje: "Ocurrió un problema inesperado. Intenta nuevamente.",
      categoria: "general",
    });
  });

  it("clasifica 422 como validacion", () => {
    const error = new ErrorClienteApi("No procesable.", 422);
    expect(normalizarError(error)).toEqual({
      mensaje: "Revisa los datos ingresados e intenta nuevamente.",
      categoria: "validacion",
    });
  });
});

describe("registrarNotificadorErrores", () => {
  it("llama al notificador cuando se reporta un error no controlado", () => {
    const notificar = vi.fn();
    const limpiar = registrarNotificadorErrores(notificar);
    notificarErrorNoControlado(new Error("detalle interno"));
    expect(notificar).toHaveBeenCalledOnce();
    notificarErrorNoControlado(new Error("otro error"));
    expect(notificar).toHaveBeenCalledTimes(2);
    limpiar();
  });

  it("desregistra el notificador al llamar la funcion de limpieza", () => {
    const notificar = vi.fn();
    const limpiar = registrarNotificadorErrores(notificar);
    limpiar();
    notificarErrorNoControlado(new Error("no debe notificar"));
    expect(notificar).not.toHaveBeenCalled();
  });
});

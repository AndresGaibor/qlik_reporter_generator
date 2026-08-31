import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { ServicioAutenticacionQlik } from "../aplicacion/servicio-autenticacion.js";
import { ErrorOAuthQlik } from "../infraestructura/cliente-oauth-qlik.js";
import { crearRutasAutenticacionQlik } from "./rutas.js";

describe("rutas OAuth Qlik", () => {
  it("redirige un callback con state inválido a la UI en vez de dejar JSON crudo", async () => {
    const servicio = {} as unknown as ServicioAutenticacionQlik;
    const app = new Hono();
    app.route(
      "/api/auth/qlik",
      crearRutasAutenticacionQlik(servicio, {
        frontendUrl: "https://app.example.com",
        produccion: true,
      }),
    );

    const callback = await app.request(
      "/api/auth/qlik/callback?code=codigo-1&state=estado-ajeno",
      { headers: { Accept: "text/html" } },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "https://app.example.com/login?oauth_error=oauth_state_invalid",
    );
  });

  it("conserva una ruta de retorno segura cuando el callback falla", async () => {
    const servicio = {} as unknown as ServicioAutenticacionQlik;
    const app = new Hono();
    app.route(
      "/api/auth/qlik",
      crearRutasAutenticacionQlik(servicio, {
        frontendUrl: "https://app.example.com",
        produccion: true,
      }),
    );

    const callback = await app.request(
      "/api/auth/qlik/callback?code=codigo-1&state=estado-ajeno",
      {
        headers: {
          Accept: "text/html",
          Cookie: "oauth_retorno=%2Fconfiguracion%23oauth",
        },
      },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "https://app.example.com/configuracion?oauth_error=oauth_state_invalid#oauth",
    );
  });

  it("conserva configuración OAuth y retorno entre inicio y callback", async () => {
    let completarRecibido: Record<string, unknown> | undefined;
    const servicio = {
      iniciar: async () => ({
        tenantQlikId: "tenant-1",
        configuracionOauthId: "oauth-1",
        origenOAuth: "tenant",
        estado: "estado-1",
        verificador: "verificador-1",
        url: "https://empresa.qlikcloud.com/oauth/authorize",
      }),
      completar: async (entrada: Record<string, unknown>) => {
        completarRecibido = entrada;
        return { tokenSesion: "sesion-1" };
      },
    } as unknown as ServicioAutenticacionQlik;
    const app = new Hono();
    app.route(
      "/api/auth/qlik",
      crearRutasAutenticacionQlik(servicio, {
        frontendUrl: "http://localhost:5173",
        produccion: false,
      }),
    );
    const inicio = await app.request(
      "/api/auth/qlik/iniciar?host=empresa.qlikcloud.com&format=json&retorno=/admin/tenants/org-1",
    );
    expect(inicio.status).toBe(200);
    const cookies = inicio.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("oauth_configuracion_id=oauth-1");
    expect(cookies).toContain("oauth_retorno=%2Fadmin%2Ftenants%2Forg-1");

    const callback = await app.request(
      "/api/auth/qlik/callback?code=codigo-1&state=estado-1",
      {
        headers: {
          Cookie: [
            "oauth_estado=estado-1",
            "oauth_verifier=verificador-1",
            "oauth_tenant_qlik=tenant-1",
            "oauth_configuracion_id=oauth-1",
            "oauth_retorno=%2Fadmin%2Ftenants%2Forg-1",
          ].join("; "),
        },
      },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "http://localhost:5173/admin/tenants/org-1?oauth_verificado=1",
    );
    expect(completarRecibido?.configuracionOauthId).toBe("oauth-1");
  });

  it("informa y registra un error de scopes al obtener la identidad", async () => {
    const errores: Array<Record<string, unknown> | undefined> = [];
    const servicio = {
      completar: async () => {
        throw new ErrorOAuthQlik("identidad", 401, "Missing user_default");
      },
    } as unknown as ServicioAutenticacionQlik;
    const app = new Hono();
    app.route(
      "/api/auth/qlik",
      crearRutasAutenticacionQlik(servicio, {
        frontendUrl: "http://localhost:5173",
        produccion: false,
        registrador: {
          info: () => undefined,
          advertencia: () => undefined,
          error: (_evento, datos) => errores.push(datos),
        },
      }),
    );

    const callback = await app.request(
      "/api/auth/qlik/callback?code=codigo-1&state=estado-1",
      {
        headers: {
          Cookie: [
            "oauth_estado=estado-1",
            "oauth_verifier=verificador-1",
            "oauth_tenant_qlik=tenant-1",
          ].join("; "),
        },
      },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "http://localhost:5173/login?oauth_error=oauth_identity_scope_error",
    );
    expect(errores).toEqual([
      expect.objectContaining({ etapa: "identidad", estadoQlik: 401 }),
    ]);
  });
});

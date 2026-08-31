import { describe, expect, it } from "bun:test";
import { cargarConfiguracion } from "./entorno.js";

const base = {
  DATABASE_URL: "postgres://usuario:clave@localhost:5432/app",
  QLIK_REDIRECT_URI: "http://localhost:3000/api/auth/qlik/callback",
  CIFRADO_CLAVE_PRINCIPAL: "clave-principal-pruebas",
};

describe("configuración de entorno OAuth", () => {
  it("acepta credenciales globales vacías cuando OAuth se configura por tenant", () => {
    const configuracion = cargarConfiguracion({
      ...base,
      QLIK_CLIENT_ID: "",
      QLIK_CLIENT_SECRET: "   ",
    });

    expect(configuracion.QLIK_CLIENT_ID).toBeUndefined();
    expect(configuracion.QLIK_CLIENT_SECRET).toBeUndefined();
  });

  it("no inventa URLs públicas de localhost cuando no fueron configuradas", () => {
    const configuracion = cargarConfiguracion({
      DATABASE_URL: "postgres://usuario:clave@localhost:5432/app",
      CIFRADO_CLAVE_PRINCIPAL: "clave-principal-pruebas",
    });

    expect(configuracion.FRONTEND_URL).toBeUndefined();
    expect(configuracion.QLIK_REDIRECT_URI).toBeUndefined();
  });

  it("REMOTE_API_URL y REMOTE_API_KEY deben ser ignorados y no existir en el tipo", () => {
    const configuracion = cargarConfiguracion({
      ...base,
      REMOTE_API_URL: "https://api.ejemplo.com",
      REMOTE_API_KEY: "secret-key-123",
    });

    expect(configuracion).not.toHaveProperty("REMOTE_API_URL");
    expect(configuracion).not.toHaveProperty("REMOTE_API_KEY");
  });
});

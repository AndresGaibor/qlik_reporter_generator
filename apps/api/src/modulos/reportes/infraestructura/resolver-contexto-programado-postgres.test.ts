import { describe, expect, it, vi } from "bun:test";
import { ResolverContextoProgramadoPostgres } from "./resolver-contexto-programado-postgres.js";

describe("ResolverContextoProgramadoPostgres", () => {
  it("renueva credenciales expiradas y construye Qlik + alcance BigQuery", async () => {
    const ahora = new Date("2026-08-14T18:00:00Z");
    const cifrado = {
      cifrar: (valor: string) => ({ cifrado: valor, iv: "iv", tag: "tag" }),
      descifrar: (valor: string) => valor,
    };
    const credencial = {
      id: "cred-1",
      identidadQlikId: "identidad-1",
      tokenAccesoCifrado: JSON.stringify({
        cifrado: "access-viejo",
        iv: "iv",
        tag: "tag",
      }),
      tokenRefrescoCifrado: JSON.stringify({
        cifrado: "refresh-viejo",
        iv: "iv",
        tag: "tag",
      }),
      tokenExpiraEn: new Date("2026-08-14T17:00:00Z"),
      scopes: ["automations"],
      estado: "activa",
      version: 1,
    };
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      query: {
        tenantsQlik: {
          findFirst: async () => ({
            id: "tenant-1",
            organizacionId: "org-1",
            host: "tenant.qlikcloud.com",
            estado: "activo",
          }),
        },
        identidadesQlik: {
          findFirst: async () => ({
            id: "identidad-1",
            usuarioIdQlik: "uqlik",
          }),
        },
        credencialesQlik: { findFirst: async () => credencial },
        conexionesDestino: {
          findFirst: async () => ({
            config: { projectId: "p", dataset: "d" },
          }),
        },
      },
      update: () => ({
        set: (valor: Record<string, unknown>) => {
          updates.push(valor);
          return { where: async () => undefined };
        },
      }),
    };
    const refrescarToken = vi.fn(async () => ({
      tokenAcceso: "access-nuevo",
      tokenRefresco: "refresh-nuevo",
      expiraEnSegundos: 3600,
      scopes: ["automations", "apps:read"],
    }));
    const oauthConfig = {
      obtenerParaTenant: vi.fn(async () => ({
        origen: "tenant" as const,
        clienteId: "cliente",
        clienteSecreto: "secreto",
        scopes: ["automations"],
      })),
    };
    const resolver = new ResolverContextoProgramadoPostgres(
      db as never,
      cifrado,
      oauthConfig,
      "https://app.example.com/api/auth/qlik/callback",
      () => ({ refrescarToken }) as never,
      (host, token) => ({ host, token }) as never,
      () => ahora,
    );

    const resultado = await resolver.resolver({
      tenantQlikId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    });

    expect(refrescarToken).toHaveBeenCalledWith("refresh-viejo");
    expect(
      resultado.qlik as unknown as { host: string; token: string },
    ).toEqual({
      host: "tenant.qlikcloud.com",
      token: "access-nuevo",
    });
    expect(resultado.alcanceBigQuery).toEqual({ projectId: "p", dataset: "d" });
    expect(updates[0]).toMatchObject({
      tokenAccesoCifrado: expect.stringContaining("access-nuevo"),
      tokenRefrescoCifrado: expect.stringContaining("refresh-nuevo"),
      estado: "activa",
      version: 2,
    });
  });

  it("reutiliza access token vigente sin refresh", async () => {
    const refrescarToken = vi.fn();
    const db = {
      query: {
        tenantsQlik: {
          findFirst: async () => ({
            id: "tenant-1",
            organizacionId: "org-1",
            host: "tenant.qlikcloud.com",
            estado: "activo",
          }),
        },
        identidadesQlik: { findFirst: async () => ({ id: "identidad-1" }) },
        credencialesQlik: {
          findFirst: async () => ({
            id: "cred-1",
            tokenAccesoCifrado: JSON.stringify({
              cifrado: "access-vigente",
              iv: "iv",
              tag: "tag",
            }),
            tokenRefrescoCifrado: null,
            tokenExpiraEn: new Date("2026-08-14T20:00:00Z"),
            scopes: [],
            estado: "activa",
            version: 1,
          }),
        },
        conexionesDestino: {
          findFirst: async () => ({ config: { projectId: "p", dataset: "d" } }),
        },
      },
    };
    const resolver = new ResolverContextoProgramadoPostgres(
      db as never,
      {
        cifrar: (v: string) => ({ cifrado: v, iv: "iv", tag: "tag" }),
        descifrar: (v: string) => v,
      },
      {
        obtenerParaTenant: async () => {
          throw new Error("no debe llamarse");
        },
      },
      "https://app.example.com/callback",
      () => ({ refrescarToken }) as never,
      (host, token) => ({ host, token }) as never,
      () => new Date("2026-08-14T18:00:00Z"),
    );

    const resultado = await resolver.resolver({
      tenantQlikId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
    });
    expect(
      resultado.qlik as unknown as { host: string; token: string },
    ).toEqual({ host: "tenant.qlikcloud.com", token: "access-vigente" });
    expect(refrescarToken).not.toHaveBeenCalled();
  });
});

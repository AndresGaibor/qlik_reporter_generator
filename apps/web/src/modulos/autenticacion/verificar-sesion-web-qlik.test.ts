import { describe, expect, it, vi } from "vitest";
import {
  decidirAccionSesionWebQlik,
  verificarSesionWebQlik,
} from "./verificar-sesion-web-qlik";

describe("verificarSesionWebQlik", () => {
  it("confirma una sesión interactiva cuando Qlik responde 200", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));

    const resultado = await verificarSesionWebQlik({
      tenantHost: "tenant.us.qlikcloud.com",
      webIntegrationId: "web-integration-id",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(resultado).toBe("autenticada");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://tenant.us.qlikcloud.com/api/v1/users/me",
      expect.objectContaining({
        mode: "cors",
        credentials: "include",
        headers: { "qlik-web-integration-id": "web-integration-id" },
      }),
    );
  });

  it("detecta que la sesión interactiva terminó únicamente ante 401", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 401 }));

    const resultado = await verificarSesionWebQlik({
      tenantHost: "tenant.us.qlikcloud.com",
      webIntegrationId: "web-integration-id",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(resultado).toBe("no_autenticada");
  });

  it.each([403, 429, 500])(
    "trata HTTP %s como estado indeterminado y no como logout",
    async (status) => {
      const fetchFn = vi.fn(async () => new Response(null, { status }));

      const resultado = await verificarSesionWebQlik({
        tenantHost: "tenant.us.qlikcloud.com",
        webIntegrationId: "web-integration-id",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      expect(resultado).toBe("indeterminada");
    },
  );

  it("trata errores de CORS/red como indeterminados", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const resultado = await verificarSesionWebQlik({
      tenantHost: "tenant.us.qlikcloud.com",
      webIntegrationId: "web-integration-id",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(resultado).toBe("indeterminada");
  });

  it("no intenta consultar Qlik si falta el Web Integration ID", async () => {
    const fetchFn = vi.fn();

    const resultado = await verificarSesionWebQlik({
      tenantHost: "tenant.us.qlikcloud.com",
      webIntegrationId: "",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(resultado).toBe("no_configurada");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("decidirAccionSesionWebQlik", () => {
  it("marca el navegador como compatible después de un 200", () => {
    expect(decidirAccionSesionWebQlik("autenticada", false)).toBe(
      "marcar_verificada",
    );
  });

  it("cierra la sesión local ante 401 si antes se confirmó la sesión web", () => {
    expect(decidirAccionSesionWebQlik("no_autenticada", true)).toBe("cerrar");
  });

  it("no expulsa al usuario ante el primer 401 si nunca se pudo comprobar cookies cross-site", () => {
    expect(decidirAccionSesionWebQlik("no_autenticada", false)).toBe(
      "continuar",
    );
  });

  it.each(["indeterminada", "no_configurada"] as const)(
    "continúa ante estado %s",
    (estado) => {
      expect(decidirAccionSesionWebQlik(estado, true)).toBe("continuar");
    },
  );
});

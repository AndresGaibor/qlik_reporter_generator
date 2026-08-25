/// <reference types="vitest" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarSesionPorCorreo } from "./api";

const fetchOriginal = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.restoreAllMocks();
});

describe("iniciarSesionPorCorreo", () => {
  it("lanza error seguro ante respuesta con cuerpo no JSON", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("Internal Server Error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    ) as unknown as typeof fetch;

    await expect(iniciarSesionPorCorreo("usuario@empresa.com")).rejects.toThrow(
      "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
    );
  });

  it("muestra un error seguro cuando el proxy no puede conectar con la API", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;

    await expect(iniciarSesionPorCorreo("usuario@empresa.com")).rejects.toThrow(
      "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos.",
    );
  });
});

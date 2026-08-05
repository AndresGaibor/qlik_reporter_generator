import { describe, expect, it } from "bun:test";
import type { ConexionDb } from "../aplicacion/puertos/repositorio-autenticacion.js";
import { obtenerIdentidadDeSesion } from "./consulta-identidad-sesion-postgres.js";

const sesionAndres = {
  identidadQlikId: "identidad-andres",
  usuarioId: "usuario-local",
  tenantQlikActivoId: "tenant-1",
};

function crearDbConIdentidad(identidad: Record<string, unknown>): ConexionDb {
  return {
    query: {
      identidadesQlik: {
        findFirst: async () => identidad,
      },
    },
  } as unknown as ConexionDb;
}

describe("obtenerIdentidadDeSesion", () => {
  it("acepta exclusivamente la identidad guardada en la sesión", async () => {
    const identidad = await obtenerIdentidadDeSesion(
      crearDbConIdentidad({
        id: "identidad-andres",
        usuarioId: "usuario-local",
        tenantQlikId: "tenant-1",
        usuarioIdQlik: "andres-qlik",
      }),
      sesionAndres,
    );

    expect(identidad?.usuarioIdQlik).toBe("andres-qlik");
  });

  it("rechaza una identidad distinta aunque comparta usuario y tenant", async () => {
    const identidad = await obtenerIdentidadDeSesion(
      crearDbConIdentidad({
        id: "identidad-byron",
        usuarioId: "usuario-local",
        tenantQlikId: "tenant-1",
        usuarioIdQlik: "byron-qlik",
      }),
      sesionAndres,
    );

    expect(identidad).toBeNull();
  });
});

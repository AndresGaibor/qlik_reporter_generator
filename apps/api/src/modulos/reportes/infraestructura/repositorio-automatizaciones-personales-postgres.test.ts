import { describe, expect, it } from "bun:test";
import { RepositorioAutomatizacionesPersonalesPostgres } from "./repositorio-automatizaciones-personales-postgres.js";

const entrada = {
  organizacionId: "11111111-1111-4111-8111-111111111111",
  tenantQlikId: "22222222-2222-4222-8222-222222222222",
  usuarioId: "33333333-3333-4333-8333-333333333333",
  automatizacionIdQlik: "auto-1",
  automatizacionNombreSnapshot: "Reportes Andres",
  estado: "activo" as const,
};

describe("RepositorioAutomatizacionesPersonalesPostgres", () => {
  it("persiste y obtiene el worker por usuario y tenant", async () => {
    const db = {
      insert: () => ({
        values: (valores: unknown) => ({
          returning: async () => [{ id: "worker-1", ...(valores as object) }],
        }),
      }),
      query: {
        automatizacionesPersonalesQlik: {
          findFirst: async () => ({ id: "worker-1", ...entrada }),
        },
      },
    };

    const repo = new RepositorioAutomatizacionesPersonalesPostgres(db as never);
    expect(await repo.crear(entrada)).toMatchObject({ id: "worker-1" });
    expect(
      await repo.obtener(entrada.usuarioId, entrada.tenantQlikId),
    ).toMatchObject({
      automatizacionIdQlik: "auto-1",
    });
  });

  it("actualiza el worker vigente sin crear otro", async () => {
    let valores: unknown;
    const fila = { id: "worker-1", ...entrada, automatizacionIdQlik: "auto-2" };
    const db = {
      update: () => ({
        set: (cambios: unknown) => {
          valores = cambios;
          return { where: () => ({ returning: async () => [fila] }) };
        },
      }),
    };

    const repo = new RepositorioAutomatizacionesPersonalesPostgres(db as never);
    const resultado = await repo.actualizar("worker-1", {
      automatizacionIdQlik: "auto-2",
    });
    expect(valores).toMatchObject({ automatizacionIdQlik: "auto-2" });
    expect(resultado.automatizacionIdQlik).toBe("auto-2");
  });
});

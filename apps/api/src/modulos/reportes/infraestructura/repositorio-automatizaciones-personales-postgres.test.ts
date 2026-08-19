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

  it("actualiza el worker solo dentro de organización y tenant", async () => {
    let condicion: unknown;
    const fila = { id: "worker-1", ...entrada, automatizacionIdQlik: "auto-2" };
    const db = {
      update: () => ({
        set: () => ({
          where: (valor: unknown) => {
            condicion = valor;
            return { returning: async () => [fila] };
          },
        }),
      }),
    };

    const repo = new RepositorioAutomatizacionesPersonalesPostgres(db as never);
    await repo.actualizarScoped(
      "worker-1",
      entrada.organizacionId,
      entrada.tenantQlikId,
      { automatizacionIdQlik: "auto-2" },
    );

    expect(Bun.inspect(condicion, { depth: 20 })).toContain("worker");
    expect(Bun.inspect(condicion, { depth: 20 })).toContain("organizacion");
    expect(Bun.inspect(condicion, { depth: 20 })).toContain("tenant");
  });

  it("falla si la actualización scoped no encuentra el worker", async () => {
    const db = {
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    };
    const repo = new RepositorioAutomatizacionesPersonalesPostgres(db as never);

    await expect(
      repo.actualizarScoped(
        "worker-1",
        entrada.organizacionId,
        entrada.tenantQlikId,
        { automatizacionIdQlik: "auto-2" },
      ),
    ).rejects.toThrow("No se encontró la automatización personal");
  });

  it("rechaza el segundo worker del mismo usuario y tenant, pero permite otros pares", async () => {
    const pares = new Set<string>();
    const db = {
      insert: () => ({
        values: (valores: typeof entrada) => ({
          returning: async () => {
            const par = `${valores.usuarioId}:${valores.tenantQlikId}`;
            if (pares.has(par)) throw new Error("unique violation");
            pares.add(par);
            return [{ id: `worker-${pares.size}`, ...valores }];
          },
        }),
      }),
    };
    const repo = new RepositorioAutomatizacionesPersonalesPostgres(db as never);
    await repo.crear(entrada);
    await expect(
      repo.crear({ ...entrada, automatizacionIdQlik: "auto-2" }),
    ).rejects.toThrow("unique violation");
    await expect(
      repo.crear({ ...entrada, tenantQlikId: "tenant-2" }),
    ).resolves.toMatchObject({ tenantQlikId: "tenant-2" });
    await expect(
      repo.crear({ ...entrada, usuarioId: "usuario-2" }),
    ).resolves.toMatchObject({ usuarioId: "usuario-2" });
  });
});

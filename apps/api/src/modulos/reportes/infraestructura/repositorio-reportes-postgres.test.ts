import { describe, expect, it } from "bun:test";
import { RepositorioReportesPostgres } from "./repositorio-reportes-postgres.js";

describe("RepositorioReportesPostgres", () => {
  it("crea una ejecución autosuficiente sin reporteId local", async () => {
    let valores: Record<string, unknown> | undefined;
    const db = {
      insert: () => ({
        values: (recibidos: Record<string, unknown>) => {
          valores = recibidos;
          return { returning: async () => [{ ...recibidos }] };
        },
      }),
    };

    await new RepositorioReportesPostgres(db as never).crearEjecucion({
      id: "ejecucion-1",
      organizacionId: "organizacion-1",
      tenantQlikId: "tenant-1",
      flujoIdQlik: "flujo-1",
      flujoNombreSnapshot: "Ventas Dataflow",
      flujoEspacioIdQlik: "espacio-1",
      automatizacionIdQlik: "auto-1",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
      uriBaseGcs: "gs://bkt/ejecucion-1/",
      estado: "preparando",
      versionCompilador: 1,
    });

    expect(valores).toMatchObject({
      organizacionId: "organizacion-1",
      tenantQlikId: "tenant-1",
      flujoNombreSnapshot: "Ventas Dataflow",
    });
    expect(valores).not.toHaveProperty("reporteId");
  });

  it("filtra historial y descargas directamente por ejecución scoped", async () => {
    const condiciones: unknown[] = [];
    const db = {
      query: {
        ejecucionesReportes: {
          findMany: async ({ where }: { where: unknown }) => {
            condiciones.push(where);
            return [];
          },
        },
      },
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: (where: unknown) => {
              condiciones.push(where);
              return {
                orderBy: () => ({ limit: async () => [] }),
                limit: async () => [],
              };
            },
          }),
        }),
      }),
    };
    const repo = new RepositorioReportesPostgres(db as never);

    await repo.listarEjecuciones("flujo-1", "tenant-1", "organizacion-1");
    await repo.listarEjecucionesDescargas({
      tenantQlikId: "tenant-1",
      organizacionId: "organizacion-1",
      usuarioId: "usuario-1",
    });

    const serializado = Bun.inspect(condiciones, { depth: 20 });
    expect(serializado).toContain("flujo_id_qlik");
    expect(serializado).toContain("tenant_qlik_id");
    expect(serializado).toContain("organizacion_id");
  });

  it("obtiene una sola fecha de última ejecución por flujo dentro del tenant", async () => {
    const condiciones: unknown[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: (where: unknown) => {
            condiciones.push(where);
            return {
              groupBy: async () => [
                {
                  flujoIdQlik: "flujo-1",
                  ultimaEjecucionEn: new Date("2026-08-20T12:00:00Z"),
                },
              ],
            };
          },
        }),
      }),
    };

    const resultado = await new RepositorioReportesPostgres(
      db as never,
    ).listarUltimasEjecucionesPorFlujo("tenant-1", "organizacion-1");

    expect(resultado).toEqual([
      {
        flujoIdQlik: "flujo-1",
        ultimaEjecucionEn: new Date("2026-08-20T12:00:00Z"),
      },
    ]);
    const serializado = Bun.inspect(condiciones, { depth: 20 });
    expect(serializado).toContain("tenant_qlik_id");
    expect(serializado).toContain("organizacion_id");
  });

  it("marca el estado terminal por ID de ejecución y no por run Qlik", async () => {
    let condicion: unknown;
    const db = {
      update: () => ({
        set: () => ({
          where: async (where: unknown) => {
            condicion = where;
          },
        }),
      }),
    };

    await new RepositorioReportesPostgres(db as never).marcarEstadoEjecucion(
      "ejecucion-seleccionada",
      "detenida",
      new Date("2026-08-19T00:00:00Z"),
    );

    expect(
      (condicion as { queryChunks: Array<{ name?: string }> }).queryChunks[1]
        ?.name,
    ).toBe("id");
  });
});

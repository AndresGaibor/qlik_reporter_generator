import { describe, expect, it } from "bun:test";
import type { JobBigQueryPersistido } from "../aplicacion/puertos/puerto-repositorio-reportes.js";
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

  describe("JobBigQuery methods", () => {
    const jobDeEjemplo: JobBigQueryPersistido = {
      ejecucionReporteId: "ejecucion-1",
      jobId: "job-abc123",
      parentJobId: null,
      projectId: "my-project",
      location: "US",
      tipo: "principal",
      estado: "done",
      creationTime: "2026-08-25T10:00:00Z",
      startTime: "2026-08-25T10:00:01Z",
      endTime: "2026-08-25T10:00:05Z",
      duracionMs: 4000,
      totalBytesProcessed: "1234567890123456789",
      totalBytesBilled: "1000000",
      totalSlotMs: "50000000000",
      cacheHit: false,
      statementType: "SELECT",
      errorReason: null,
      errorMessage: null,
      metadataJson: { reservation_id: "default" },
    };

    it("guardarJobBigQueryEjecucion hace upsert idempotente por projectId + location + jobId", async () => {
      const inserts: unknown[] = [];
      const upserts: unknown[] = [];
      const db = {
        insert: () => ({
          values: (v: unknown) => {
            inserts.push(v);
            return {
              onConflictDoUpdate: () => ({
                set: () => ({}),
              }),
            };
          },
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      await repo.guardarJobBigQueryEjecucion(jobDeEjemplo);
      await repo.guardarJobBigQueryEjecucion(jobDeEjemplo);

      expect(inserts).toHaveLength(2);
      expect(inserts[0]).toMatchObject({
        jobId: "job-abc123",
        projectId: "my-project",
        location: "US",
      });
    });

    it("guardarJobBigQueryEjecucion normaliza null location a US", async () => {
      const inserts: unknown[] = [];
      const db = {
        insert: () => ({
          values: (v: unknown) => {
            inserts.push(v);
            return {
              onConflictDoUpdate: () => ({ set: () => ({}) }),
            };
          },
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      await repo.guardarJobBigQueryEjecucion({
        ...jobDeEjemplo,
        location: null as unknown as string,
      });

      expect(inserts[0]).toMatchObject({ location: "US" });
    });

    it("guardarJobBigQueryEjecucion mantiene bytes y slot-ms como strings sin conversión", async () => {
      const inserts: unknown[] = [];
      const db = {
        insert: () => ({
          values: (v: unknown) => {
            inserts.push(v);
            return {
              onConflictDoUpdate: () => ({ set: () => ({}) }),
            };
          },
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      await repo.guardarJobBigQueryEjecucion(jobDeEjemplo);

      const insertado = inserts[0] as Record<string, unknown>;
      expect(insertado.totalBytesProcessed).toBe("1234567890123456789");
      expect(insertado.totalBytesBilled).toBe("1000000");
      expect(insertado.totalSlotMs).toBe("50000000000");
      expect(typeof insertado.totalBytesProcessed).toBe("string");
    });

    it("listarJobsBigQueryPorEjecucion devuelve jobs ordenados por creationTime", async () => {
      const jobsFijos: Array<Record<string, unknown>> = [
        {
          ...jobDeEjemplo,
          jobId: "job-2",
          creationTime: new Date("2026-08-25T10:02:00Z"),
          startTime: null,
          endTime: null,
        },
        {
          ...jobDeEjemplo,
          jobId: "job-1",
          creationTime: new Date("2026-08-25T10:01:00Z"),
          startTime: null,
          endTime: null,
        },
        {
          ...jobDeEjemplo,
          jobId: "job-3",
          creationTime: new Date("2026-08-25T10:03:00Z"),
          startTime: null,
          endTime: null,
        },
      ];

      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(jobsFijos),
            }),
          }),
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      const resultado = await repo.listarJobsBigQueryPorEjecucion(
        "ejecucion-1" as string,
      );

      expect(resultado).toHaveLength(3);
      expect(resultado[0].jobId).toBe("job-2");
      expect(resultado[1].jobId).toBe("job-1");
      expect(resultado[2].jobId).toBe("job-3");
    });

    it("listarJobsBigQueryPorEjecucion mapea correctamente campos del job", async () => {
      const jobFijo = {
        ...jobDeEjemplo,
        jobId: "job-x",
        parentJobId: "parent-1",
        cacheHit: true,
        creationTime: new Date("2026-08-25T10:00:00Z"),
        startTime: null,
        endTime: null,
      };

      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([jobFijo]),
            }),
          }),
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      const [resultado] = await repo.listarJobsBigQueryPorEjecucion(
        "ejecucion-1" as string,
      );

      expect(resultado.jobId).toBe("job-x");
      expect(resultado.parentJobId).toBe("parent-1");
      expect(resultado.cacheHit).toBe(true);
      expect(resultado.totalBytesProcessed).toBe("1234567890123456789");
    });

    it("obtenerEjecucionPorJobId encuentra ejecución por jobId del parent", async () => {
      const ejecucionEncontrada = {
        id: "ejecucion-1",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Test",
        automatizacionIdQlik: "auto-1",
        hashDataflowSha256: "a".repeat(64),
        scriptDataflow: "s",
        sqlBigQueryCompilado: "SELECT 1",
        scriptExportacion: "EXPORT",
        uriBaseGcs: "gs://bkt/",
        estado: "iniciada",
        versionCompilador: 1,
        jobIdPrincipalBigQuery: "job-abc123",
      };

      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [ejecucionEncontrada],
            }),
          }),
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      const resultado = await repo.obtenerEjecucionPorJobId("job-abc123");

      expect(resultado).not.toBeNull();
      const r = resultado as { id: string; jobIdPrincipalBigQuery: string };
      expect(r.id).toBe("ejecucion-1");
      expect(r.jobIdPrincipalBigQuery).toBe("job-abc123");
    });

    it("obtenerEjecucionPorJobId devuelve null si no existe", async () => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [],
            }),
          }),
        }),
      };

      const repo = new RepositorioReportesPostgres(db as never);
      const resultado = await repo.obtenerEjecucionPorJobId("job-inexistente");

      expect(resultado).toBeNull();
    });
  });
});

import { describe, expect, it } from "bun:test";
import { RepositorioReportesPostgres } from "./repositorio-reportes-postgres.js";

const entrada = {
  organizacionId: "11111111-1111-4111-8111-111111111111",
  tenantQlikId: "22222222-2222-4222-8222-222222222222",
  creadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
  nombre: "Ventas",
  flujoIdQlik: "flujo-1",
  flujoNombreSnapshot: "Ventas Dataflow",
  flujoEspacioIdQlik: "espacio-1",
  estado: "activa" as const,
};

describe("RepositorioReportesPostgres", () => {
  it("conserva el runId conocido al marcar una ejecución con error", async () => {
    let cambios: Record<string, unknown> | undefined;
    const db = {
      update: () => ({
        set: (recibidos: Record<string, unknown>) => {
          cambios = recibidos;
          return { where: async () => undefined };
        },
      }),
    };

    await new RepositorioReportesPostgres(db as never).marcarEjecucionError(
      "ejecucion-1",
      "persistir-run",
      "falló persistir",
      new Date("2026-01-01T00:00:00.000Z"),
      "run-1",
    );

    expect(cambios).toMatchObject({
      runIdQlik: "run-1",
      etapaError: "persistir-run",
      mensajeError: "falló persistir",
    });
  });

  it("crea un reporte sin persistir propiedad de Qlik Automate", async () => {
    let valores: Record<string, unknown> | undefined;
    const db = {
      insert: () => ({
        values: (recibidos: Record<string, unknown>) => {
          valores = recibidos;
          return { returning: async () => [{ id: "reporte-1", ...recibidos }] };
        },
      }),
    };
    const resultado = await new RepositorioReportesPostgres(
      db as never,
    ).crearReporte(entrada);
    expect(resultado.id).toBe("reporte-1");
    expect(valores).not.toHaveProperty("automatizacionIdQlik");
    expect(valores).not.toHaveProperty("nombreSnapshot");
  });

  it("crea la ejecución con reporte y worker históricos nullable", async () => {
    let valores: Record<string, unknown> | undefined;
    const db = {
      insert: () => ({
        values: (recibidos: Record<string, unknown>) => {
          valores = recibidos;
          return {
            returning: async () => [
              {
                ...recibidos,
                ejecutadoPorUsuarioId: null,
                automatizacionPersonalId: null,
              },
            ],
          };
        },
      }),
    };
    const resultado = await new RepositorioReportesPostgres(
      db as never,
    ).crearEjecucion({
      id: "ejecucion-1",
      reporteId: "reporte-1",
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "legacy-auto",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
      uriBaseGcs: "gs://bkt/ejecucion-1/",
      estado: "preparando",
      versionCompilador: 1,
    });
    expect(valores).toMatchObject({
      reporteId: "reporte-1",
      automatizacionIdQlik: "legacy-auto",
    });
    expect(resultado.ejecutadoPorUsuarioId).toBeNull();
    expect(resultado.automatizacionPersonalId).toBeNull();
  });

  it("aplica tenant y organización al obtener y listar", async () => {
    const condiciones: unknown[] = [];
    const fila = {
      id: "reporte-1",
      organizacionId: "organizacion-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "usuario-1",
      nombre: "Ventas",
      flujoIdQlik: "flujo-1",
      flujoNombreSnapshot: "Ventas",
      estado: "activa",
    };
    const contieneAlcanceCorrecto = (where: unknown) => {
      const valores: string[] = [];
      const visitar = (valor: unknown) => {
        if (!valor || typeof valor !== "object") return;
        const objeto = valor as { value?: string[]; queryChunks?: unknown[] };
        if (objeto.value) valores.push(...objeto.value);
        objeto.queryChunks?.forEach(visitar);
      };
      visitar(where);
      return (
        valores.join("").includes("reporte-1") &&
        valores.join("").includes("tenant-1") &&
        valores.join("").includes("organizacion-1")
      );
    };
    const db = {
      query: {
        reportes: {
          findFirst: async ({ where }: { where: unknown }) => {
            condiciones.push(where);
            return contieneAlcanceCorrecto(where) ? fila : null;
          },
          findMany: async ({ where }: { where: unknown }) => {
            condiciones.push(where);
            return contieneAlcanceCorrecto(where) ? [fila] : [];
          },
        },
      },
    };
    const repo = new RepositorioReportesPostgres(db as never);
    expect(
      await repo.obtenerPorId("reporte-1", "tenant-1", "organizacion-1"),
    ).toMatchObject({
      id: "reporte-1",
    });
    expect(
      await repo.obtenerPorId("reporte-1", "tenant-2", "organizacion-2"),
    ).toBeNull();
    await repo.listar({
      tenantQlikId: "tenant-1",
      organizacionId: "organizacion-1",
    });

    const valores = condiciones.flatMap((condicion) => {
      const encontrados: string[] = [];
      const visitar = (valor: unknown) => {
        if (!valor || typeof valor !== "object") return;
        const objeto = valor as { value?: string[]; queryChunks?: unknown[] };
        if (objeto.value) encontrados.push(...objeto.value);
        objeto.queryChunks?.forEach(visitar);
      };
      visitar(condicion);
      return encontrados;
    });
    expect(valores.join("")).toContain("reporte-1");
    expect(valores.join("")).toContain("tenant-1");
    expect(valores.join("")).toContain("organizacion-1");
    expect(valores.join("")).toContain("tenant-2");
    expect(valores.join("")).toContain("organizacion-2");
  });

  it("conserva el worker y GCS históricos sin consultar el worker vigente", async () => {
    const fila = {
      id: "ejecucion-historica",
      reporteNombre: "Ventas históricas",
      automatizacionIdQlik: "auto-viejo",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs:
        "gs://bkt_dwh/POCs/TalendDescargados/ventas/ejecucion-historica/",
      creadoEn: new Date("2026-01-01T00:00:00.000Z"),
      finalizadoEn: new Date("2026-01-01T00:01:00.000Z"),
    };
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => [fila] }),
          }),
        }),
      }),
      query: {
        get automatizacionesPersonalesQlik() {
          throw new Error("el historial no debe consultar el worker vigente");
        },
      },
    };

    const resultado = await new RepositorioReportesPostgres(
      db as never,
    ).obtenerEjecucionDescarga({
      id: "ejecucion-historica",
      tenantQlikId: "tenant-1",
      organizacionId: "organizacion-1",
    });

    expect(resultado).toMatchObject({
      automatizacionIdQlik: "auto-viejo",
      uriBaseGcs: fila.uriBaseGcs,
    });
  });

  it("lista descargas por reporte dentro del tenant y organización", async () => {
    let condicion: unknown;
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: (valor: unknown) => {
              condicion = valor;
              return {
                orderBy: () => ({ limit: async () => [] }),
              };
            },
          }),
        }),
      }),
    };

    await new RepositorioReportesPostgres(
      db as never,
    ).listarEjecucionesDescargas({
      tenantQlikId: "tenant-1",
      organizacionId: "organizacion-1",
    });

    expect(Bun.inspect(condicion, { depth: 20 })).toContain("tenant_qlik_id");
    expect(Bun.inspect(condicion, { depth: 20 })).toContain("organizacion_id");
    expect(Bun.inspect(condicion, { depth: 20 })).not.toContain(
      "automatizaciones_personales_qlik",
    );
  });
});

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
    expect(valores).not.toHaveProperty("automatizacionNombreSnapshot");
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
});

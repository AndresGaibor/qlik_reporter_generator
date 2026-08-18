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
});

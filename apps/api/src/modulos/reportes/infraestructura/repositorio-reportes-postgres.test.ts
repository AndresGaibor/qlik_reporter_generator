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
  destinoProveedor: "gcs",
  destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
  destinoNombreSnapshot: "TalendDescargados",
  automatizacionIdQlik: "auto-1",
  automatizacionNombreSnapshot: "Ventas",
  programar: false,
  estado: "activa" as const,
};

describe("RepositorioReportesPostgres", () => {
  it("persiste la asociación Dataflow-Automate-GCS", async () => {
    let valores: unknown;
    const db = {
      insert: () => ({
        values: (entradaInsert: unknown) => {
          valores = entradaInsert;
          return {
            returning: async () => [
              {
                id: "44444444-4444-4444-8444-444444444444",
                ...(entradaInsert as object),
              },
            ],
          };
        },
      }),
      query: { configuracionesAutomatizacion: { findFirst: async () => null } },
    };
    const repo = new RepositorioReportesPostgres(db as never);

    const resultado = await repo.crearConfiguracion(entrada);

    expect(valores).toMatchObject({
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      destinoProveedor: "gcs",
      destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
    });
    expect(resultado.id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("resuelve el reporte por tenant y automatización", async () => {
    let consultaRecibida = false;
    const fila = { id: "config-1", ...entrada };
    const db = {
      query: {
        configuracionesAutomatizacion: {
          findFirst: async (opciones: unknown) => {
            consultaRecibida = Boolean(opciones);
            return fila;
          },
        },
      },
    };
    const repo = new RepositorioReportesPostgres(db as never);

    expect(
      await repo.obtenerPorAutomatizacion(entrada.tenantQlikId, "auto-1"),
    ).toEqual(fila);
    expect(consultaRecibida).toBe(true);
  });

  it("crea la auditoría y actualiza sus estados", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const db = {
      insert: () => ({
        values: (valor: Record<string, unknown>) => ({
          returning: async () => [
            {
              ...valor,
              runIdQlik: null,
              etapaError: null,
              mensajeError: null,
              iniciadoEn: null,
              finalizadoEn: null,
            },
          ],
        }),
      }),
      update: () => ({
        set: (valor: Record<string, unknown>) => {
          sets.push(valor);
          return { where: async () => undefined };
        },
      }),
      query: { configuracionesAutomatizacion: { findFirst: async () => null } },
    };
    const repo = new RepositorioReportesPostgres(db as never);
    const id = "55555555-5555-4555-8555-555555555555";

    await repo.crearEjecucion({
      id,
      configuracionId: "44444444-4444-4444-8444-444444444444",
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      hashDataflowSha256: "a".repeat(64),
      scriptDataflow: "script",
      sqlBigQueryCompilado: "SELECT 1",
      scriptExportacion: "EXPORT DATA",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/r/e/",
      tipoEjecucion: "manual",
      estado: "preparando",
      versionCompilador: 1,
    });
    await repo.marcarEjecucionIniciada(
      id,
      "run-1",
      new Date("2026-08-14T23:00:00Z"),
    );
    await repo.marcarEjecucionError(
      id,
      "talend",
      "falló",
      new Date("2026-08-14T23:01:00Z"),
    );

    expect(sets[0]).toMatchObject({ estado: "iniciada", runIdQlik: "run-1" });
    expect(sets[1]).toMatchObject({
      estado: "error",
      etapaError: "talend",
      mensajeError: "falló",
    });
  });

  it("lista programaciones vencidas y reclama con compare-and-swap", async () => {
    const programacion = {
      id: "66666666-6666-4666-8666-666666666666",
      configuracionId: "44444444-4444-4444-8444-444444444444",
      tipo: "cron",
      expresionCron: "0 8 * * *",
      zonaHoraria: "America/Guayaquil",
      activa: true,
      proximaEjecucionEn: new Date("2026-08-14T13:00:00Z"),
    };
    let retornarClaim = true;
    const db = {
      query: {
        configuracionesAutomatizacion: { findFirst: async () => null },
        programacionesAutomatizacion: {
          findMany: async () => [programacion],
        },
      },
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () =>
              retornarClaim ? [{ id: programacion.id }] : [],
          }),
        }),
      }),
    };
    const repo = new RepositorioReportesPostgres(db as never);

    expect(
      await repo.listarProgramacionesVencidas(new Date("2026-08-14T18:00:00Z")),
    ).toEqual([
      expect.objectContaining({
        id: programacion.id,
        expresionCron: "0 8 * * *",
      }),
    ]);
    expect(
      await repo.intentarReclamarProgramacion(
        programacion.id,
        programacion.proximaEjecucionEn,
        new Date("2026-08-15T13:00:00Z"),
        new Date("2026-08-14T18:00:00Z"),
      ),
    ).toBe(true);
    retornarClaim = false;
    expect(
      await repo.intentarReclamarProgramacion(
        programacion.id,
        programacion.proximaEjecucionEn,
        new Date("2026-08-15T13:00:00Z"),
        new Date("2026-08-14T18:00:00Z"),
      ),
    ).toBe(false);
  });
});

import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { ProgramadorReportes } from "./programador-reportes.js";

const SCRIPT =
  "LIB CONNECT TO [Google BigQuery:Prod]; [x]: LOAD [id]; SQL SELECT id FROM `p.d.t`;";

describe("ProgramadorReportes", () => {
  it("reclama la programación y usa EjecutarReporte como ejecución programada", async () => {
    const tipos: string[] = [];
    const qlik = {
      listarEjecuciones: vi.fn(async () => []),
      obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "auto-1",
        name: "Reporte",
        schedules: [],
        workspace: {
          blocks: [
            {
              name: "executeTask",
              type: "EndpointBlock",
              inputs: [{ mode: "keyValue", value: [] }],
            },
          ],
        },
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion: vi.fn(async (_id, definicion) => ({
        id: "auto-1",
        name: "Reporte",
        ...definicion,
      })),
      ejecutarAutomatizacion: vi.fn(async () => ({ runId: "run-programado" })),
    } as unknown as ServicioQlik;
    const programacion = {
      id: "prog-1",
      configuracionId: "config-1",
      expresionCron: "0 8 * * *",
      zonaHoraria: "America/Guayaquil",
      proximaEjecucionEn: new Date("2026-08-14T13:00:00Z"),
      activa: true,
    };
    const repositorio = {
      listarProgramacionesVencidas: vi.fn(async () => [programacion]),
      intentarReclamarProgramacion: vi.fn(async () => true),
      obtenerConfiguracionPorId: vi.fn(async () => ({
        id: "config-1",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Reporte",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Flujo",
        destinoProveedor: "gcs",
        destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
        destinoNombreSnapshot: "TalendDescargados",
        automatizacionIdQlik: "auto-1",
        automatizacionNombreSnapshot: "Reporte",
        programar: true,
        estado: "activa" as const,
      })),
      obtenerPorAutomatizacion: vi.fn(async () => ({
        id: "config-1",
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        creadoPorUsuarioId: "user-1",
        nombre: "Reporte",
        flujoIdQlik: "flujo-1",
        flujoNombreSnapshot: "Flujo",
        destinoProveedor: "gcs",
        destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
        destinoNombreSnapshot: "TalendDescargados",
        automatizacionIdQlik: "auto-1",
        automatizacionNombreSnapshot: "Reporte",
        programar: true,
        estado: "activa" as const,
      })),
      crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
        tipos.push(String(entrada.tipoEjecucion));
        return entrada;
      }),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const bloqueos = {
      ejecutarExclusivo: async (
        _clave: string,
        tarea: () => Promise<unknown>,
      ) => tarea(),
    };
    const programador = new ProgramadorReportes(
      repositorio as never,
      bloqueos as never,
      async () => ({ qlik, alcanceBigQuery: { projectId: "p", dataset: "d" } }),
      () => "77777777-7777-4777-8777-777777777777",
    );

    const resultados = await programador.ejecutarPendientes(
      new Date("2026-08-14T18:00:00Z"),
    );

    expect(resultados).toEqual([
      expect.objectContaining({ programacionId: "prog-1", ejecutada: true }),
    ]);
    expect(repositorio.intentarReclamarProgramacion).toHaveBeenCalledWith(
      "prog-1",
      programacion.proximaEjecucionEn,
      new Date("2026-08-15T13:00:00.000Z"),
      new Date("2026-08-14T18:00:00.000Z"),
    );
    expect(tipos).toEqual(["programada"]);
  });
});

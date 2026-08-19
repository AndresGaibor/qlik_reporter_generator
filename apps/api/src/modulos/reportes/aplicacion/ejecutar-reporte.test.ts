import { describe, expect, it, vi } from "bun:test";
import { EjecutarReporte } from "./ejecutar-reporte.js";

const SCRIPT =
  "LIB CONNECT TO [Google BigQuery:Prod]; SQL SELECT id FROM `p.d.t`;";
const worker = { id: "worker-db-1", automatizacionIdQlik: "worker-1" };
const workspace = JSON.parse(
  await Bun.file(
    new URL(
      "../fixtures/automate-talend-workspace.sanitized.json",
      import.meta.url,
    ),
  ).text(),
);

function caso() {
  const qlik = {
    listarFlujos: vi.fn(async () => [
      { id: "df-1", name: "Ventas Diarias", spaceId: "sp-1" },
    ]),
    obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
    obtenerAutomatizacion: vi.fn(async () => ({
      id: "worker-1",
      name: "Worker",
      workspace: structuredClone(workspace),
    })),
    actualizarAutomatizacion: vi.fn(async () => ({})),
    ejecutarAutomatizacion: vi.fn(async () => ({ runId: "run-1" })),
  };
  const repositorio = {
    crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => entrada),
    marcarEjecucionIniciada: vi.fn(async () => undefined),
    marcarEjecucionError: vi.fn(async () => undefined),
  };
  const workers = { ejecutar: vi.fn(async () => worker) };
  const ejecutar = new EjecutarReporte(
    qlik as never,
    repositorio as never,
    {
      ejecutarExclusivo: async (_: string, tarea: () => Promise<unknown>) =>
        tarea(),
    } as never,
    { projectId: "p", dataset: "d" },
    () => "11111111-1111-4111-8111-111111111111",
    () => ({
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
      plantillaIdQlik: "base",
      plantillaNombre: "Base",
    }),
    workers as never,
  );
  return { ejecutar, qlik, repositorio, workers };
}

describe("EjecutarReporte", () => {
  it("resuelve el Dataflow actual por flujoIdQlik y audita su snapshot", async () => {
    const { ejecutar, repositorio, workers } = caso();
    await ejecutar.ejecutar({
      flujoIdQlik: "df-1",
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
    });
    expect(workers.ejecutar).toHaveBeenCalled();
    expect(repositorio.crearEjecucion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        flujoIdQlik: "df-1",
        flujoNombreSnapshot: "Ventas Diarias",
        flujoEspacioIdQlik: "sp-1",
        automatizacionIdQlik: "worker-1",
      }),
    );
  });

  it("falla si el Dataflow no pertenece al tenant visible", async () => {
    const { ejecutar } = caso();
    await expect(
      ejecutar.ejecutar({
        flujoIdQlik: "df-404",
        tenantId: "tenant-1",
        organizacionId: "org-1",
        usuarioId: "user-1",
        usuarioIdQlik: "qlik-1",
      }),
    ).rejects.toMatchObject({ codigo: "DATAFLOW_NO_ENCONTRADO" });
  });
});

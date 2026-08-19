import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { EjecutarReporte } from "./ejecutar-reporte.js";

const SCRIPT =
  "LIB CONNECT TO [Google BigQuery:Prod]; SQL SELECT id FROM `p.d.t`;";
const reporte = {
  id: "reporte-1",
  organizacionId: "org-1",
  tenantQlikId: "tenant-1",
  creadoPorUsuarioId: "creator-1",
  nombre: "Ventas Diarias",
  flujoIdQlik: "flujo-1",
  flujoNombreSnapshot: "Ventas",
  estado: "activa" as const,
};
const worker = {
  id: "worker-db-1",
  organizacionId: "org-1",
  tenantQlikId: "tenant-1",
  usuarioId: "user-1",
  automatizacionIdQlik: "worker-old",
  automatizacionNombreSnapshot: "Worker",
  estado: "activo" as const,
};
const TALEND_WORKSPACE = JSON.parse(
  await Bun.file(
    new URL(
      "../fixtures/automate-talend-workspace.sanitized.json",
      import.meta.url,
    ),
  ).text(),
) as Record<string, unknown>;

function workspace() {
  return structuredClone(TALEND_WORKSPACE);
}

function casoBase(overrides: Record<string, unknown> = {}) {
  const orden: string[] = [];
  const qlik = {
    obtenerScriptApp: vi.fn(async () => {
      orden.push("preparar-dataflow");
      return { script: SCRIPT };
    }),
    obtenerAutomatizacion: vi.fn(async () => {
      orden.push("obtener-workspace");
      return { id: "worker-old", name: "Worker", workspace: workspace() };
    }),
    actualizarAutomatizacion: vi.fn(async () => {
      orden.push("actualizar-workspace");
      return {};
    }),
    ejecutarAutomatizacion: vi.fn(async () => {
      orden.push("crear-run");
      return { runId: "run-1" };
    }),
    listarEjecuciones: vi.fn(async () => {
      throw new Error("no debe consultar precondición remota");
    }),
  } as unknown as ServicioQlik;
  const repositorio = {
    obtenerPorId: vi.fn(async () => {
      orden.push("leer-reporte");
      return reporte;
    }),
    crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
      orden.push("crear-auditoria");
      return entrada;
    }),
    marcarEjecucionIniciada: vi.fn(async () => undefined),
    marcarEjecucionError: vi.fn(async () => undefined),
  };
  const bloqueos = {
    ejecutarExclusivo: vi.fn(
      async (_clave: string, tarea: () => Promise<unknown>) => {
        orden.push("lock");
        const resultado = await tarea();
        orden.push("unlock");
        return resultado;
      },
    ),
  };
  const workers = {
    ejecutar: vi.fn(async () => {
      orden.push("resolver-worker");
      return worker;
    }),
  };
  const caso = new EjecutarReporte(
    qlik,
    repositorio as never,
    bloqueos as never,
    { projectId: "p", dataset: "d" },
    () => "22222222-2222-4222-8222-222222222222",
    () => ({
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      usuarioId: "user-1",
      usuarioIdQlik: "user-qlik-1",
      plantillaIdQlik: "template-1",
      plantillaNombre: "Plantilla",
    }),
    workers as never,
  );
  return { caso, qlik, repositorio, bloqueos, workers, orden, ...overrides };
}

const entrada = {
  reporteId: "reporte-1",
  tenantId: "tenant-1",
  organizacionId: "org-1",
  usuarioId: "user-1",
  usuarioIdQlik: "user-qlik-1",
};

describe("EjecutarReporte", () => {
  it("resuelve worker personal y ejecuta en orden con lock corto", async () => {
    const { caso, repositorio, bloqueos, workers, orden } = casoBase();
    await caso.ejecutar(entrada);
    expect(repositorio.obtenerPorId).toHaveBeenCalledWith(
      "reporte-1",
      "tenant-1",
      "org-1",
    );
    expect(workers.ejecutar).toHaveBeenCalled();
    expect(orden).toEqual([
      "leer-reporte",
      "preparar-dataflow",
      "resolver-worker",
      "crear-auditoria",
      "lock",
      "obtener-workspace",
      "actualizar-workspace",
      "crear-run",
      "unlock",
    ]);
    expect(bloqueos.ejecutarExclusivo).toHaveBeenCalledWith(
      "tenant-1:worker-old",
      expect.any(Function),
    );
    expect(repositorio.crearEjecucion).toHaveBeenCalledWith(
      expect.objectContaining({
        ejecutadoPorUsuarioId: "user-1",
        automatizacionPersonalId: "worker-db-1",
        automatizacionIdQlik: "worker-old",
      }),
    );
  });

  it("si el lock corto está ocupado deja la auditoría en conflicto sin tocar Qlik", async () => {
    const { caso, repositorio, qlik, bloqueos } = casoBase();
    bloqueos.ejecutarExclusivo.mockResolvedValue(undefined);
    await expect(caso.ejecutar(entrada)).rejects.toThrow("conflicto");
    expect(repositorio.marcarEjecucionError).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "lock",
      expect.stringContaining("ocupado"),
      expect.any(Date),
    );
    expect(qlik.obtenerAutomatizacion).not.toHaveBeenCalled();
    expect(qlik.actualizarAutomatizacion).not.toHaveBeenCalled();
    expect(qlik.ejecutarAutomatizacion).not.toHaveBeenCalled();
  });
});

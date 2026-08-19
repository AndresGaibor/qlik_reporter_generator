import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { EjecutarReporte } from "./ejecutar-reporte.js";

const SCRIPT = `
LIB CONNECT TO [Google BigQuery:Prod];
[ventas]: LOAD [id], Upper([categoria]) AS [categoria];
SQL SELECT id, categoria FROM \`p.d.ventas\` WHERE id > 0;
`;

async function workspaceTalend(): Promise<Record<string, unknown>> {
  const fixture = new URL(
    "../fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

function valorVariable(
  workspace: Record<string, unknown>,
  nombre: string,
): string | undefined {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  const block = blocks.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as Record<string, unknown>).name === nombre,
  ) as Record<string, unknown> | undefined;
  const operations = Array.isArray(block?.operations) ? block.operations : [];
  const setValue = operations.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as Record<string, unknown>).id === "set_value",
  ) as Record<string, unknown> | undefined;
  return typeof setValue?.value === "string" ? setValue.value : undefined;
}

function configuracion() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizacionId: "org-1",
    tenantQlikId: "tenant-1",
    creadoPorUsuarioId: "user-1",
    nombre: "Ventas Diarias",
    flujoIdQlik: "flujo-1",
    flujoNombreSnapshot: "Ventas DF",
    automatizacionIdQlik: "auto-1",
    automatizacionNombreSnapshot: "Ventas",
    estado: "activa" as const,
  };
}

describe("EjecutarReporte", () => {
  it("recompila current, audita, actualiza las cuatro queries Talend y luego crea el run", async () => {
    const orden: string[] = [];
    let workspaceActualizado: Record<string, unknown> | undefined;
    const qlik = {
      listarEjecuciones: vi.fn(async () => []),
      obtenerScriptApp: vi.fn(async () => {
        orden.push("current");
        return { script: SCRIPT };
      }),
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "auto-1",
        name: "Ventas",
        schedules: [],
        workspace: await workspaceTalend(),
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion: vi.fn(async (_id, definicion) => {
        orden.push("actualizar-automate");
        workspaceActualizado = (
          definicion as { workspace: Record<string, unknown> }
        ).workspace;
        return { id: "auto-1", name: "Ventas", ...definicion };
      }),
      ejecutarAutomatizacion: vi.fn(async () => {
        orden.push("run");
        return { runId: "run-1" };
      }),
    } as unknown as ServicioQlik;

    const ejecuciones: Array<Record<string, unknown>> = [];
    const repositorio = {
      obtenerPorAutomatizacion: vi.fn(async () => configuracion()),
      crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
        orden.push("auditar");
        ejecuciones.push(entrada);
        return entrada;
      }),
      marcarEjecucionIniciada: vi.fn(async (_id: string, runId: string) => {
        orden.push(`iniciada:${runId}`);
      }),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const bloqueos = {
      ejecutarExclusivo: async (
        _clave: string,
        tarea: () => Promise<unknown>,
      ) => {
        orden.push("lock");
        return tarea();
      },
    };
    const ejecucionId = "22222222-2222-4222-8222-222222222222";
    const caso = new EjecutarReporte(
      qlik,
      repositorio as never,
      bloqueos as never,
      { projectId: "p", dataset: "d" },
      () => ejecucionId,
    );

    const resultado = await caso.ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
      usuarioId: "user-1",
    });

    expect(resultado).toEqual({
      runId: "run-1",
      ejecucionReporteId: ejecucionId,
    });
    expect(orden).toEqual([
      "lock",
      "current",
      "auditar",
      "actualizar-automate",
      "run",
      "iniciada:run-1",
    ]);
    expect(ejecuciones[0]).toMatchObject({
      hashDataflowSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      scriptDataflow: SCRIPT,
      sqlBigQueryCompilado: expect.stringContaining("`p.d.ventas`"),
      scriptExportacion: expect.stringContaining("-- bq_export_data"),
      creadoPorUsuarioId: "user-1",
      uriBaseGcs: `gs://bkt_dwh/POCs/TalendDescargados/usuarios/user-1/ventas-diarias/${ejecucionId}/`,
      estado: "preparando",
      versionCompilador: 2,
    });
    expect(valorVariable(workspaceActualizado ?? {}, "BqSelectData")).toContain(
      `__qlik_reportes_${ejecucionId.replaceAll("-", "_")}`,
    );
    expect(valorVariable(workspaceActualizado ?? {}, "BqExportData")).toContain(
      `gs://bkt_dwh/POCs/TalendDescargados/usuarios/user-1/ventas-diarias/${ejecucionId}/parte-__PART_PADDED__-*.csv.gz`,
    );
    expect(valorVariable(workspaceActualizado ?? {}, "Credenciales")).toBe(
      "CREDENCIAL_SANITIZADA",
    );
  });

  it("rechaza una segunda solicitud cuando no adquiere el lock", async () => {
    const caso = new EjecutarReporte(
      {} as ServicioQlik,
      {} as never,
      { ejecutarExclusivo: async () => undefined },
      { projectId: "p", dataset: "d" },
    );
    await expect(
      caso.ejecutar({
        tenantId: "tenant-1",
        organizacionId: "org-1",
        automatizacionIdQlik: "auto-1",
      }),
    ).rejects.toThrow("solicitud de ejecución");
  });

  it("marca error y no dispara Talend si falla la actualización de Automate", async () => {
    const marcarEjecucionError = vi.fn(async () => undefined);
    const ejecutarAutomatizacion = vi.fn(async () => ({
      runId: "no-debe-ejecutarse",
    }));
    const qlik = {
      listarEjecuciones: vi.fn(async () => []),
      obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT })),
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "auto-1",
        name: "Ventas",
        schedules: [],
        workspace: await workspaceTalend(),
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion: vi.fn(async () => {
        throw new Error("Qlik no aceptó el workspace");
      }),
      ejecutarAutomatizacion,
    } as unknown as ServicioQlik;
    const repositorio = {
      obtenerPorAutomatizacion: async () => configuracion(),
      crearEjecucion: vi.fn(async (entrada: unknown) => entrada),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError,
    };
    const caso = new EjecutarReporte(
      qlik,
      repositorio as never,
      {
        ejecutarExclusivo: async (
          _clave: string,
          tarea: () => Promise<unknown>,
        ) => tarea(),
      } as never,
      { projectId: "p", dataset: "d" },
      () => "22222222-2222-4222-8222-222222222222",
    );

    await expect(
      caso.ejecutar({
        tenantId: "tenant-1",
        organizacionId: "org-1",
        automatizacionIdQlik: "auto-1",
      }),
    ).rejects.toThrow("Qlik no aceptó");

    expect(ejecutarAutomatizacion).not.toHaveBeenCalled();
    expect(marcarEjecucionError).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "actualizar-automate",
      "Qlik no aceptó el workspace",
      expect.any(Date),
    );
  });
});

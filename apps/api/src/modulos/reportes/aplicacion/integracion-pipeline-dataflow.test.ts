import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { EjecutarReporte } from "./ejecutar-reporte.js";
import { ProgramadorReportes } from "./programador-reportes.js";

const SCRIPT_V1 = `
LIB CONNECT TO [Google BigQuery:Prod];
[ventas]: LOAD [id], [monto];
SQL SELECT id, monto FROM \`p.d.ventas\` WHERE monto > 0;
`;
const SCRIPT_V2 = `
LIB CONNECT TO [Google BigQuery:Prod];
[ventas]: LOAD [id], [monto], Upper([categoria]) AS [categoria];
SQL SELECT id, monto, categoria FROM \`p.d.ventas\` WHERE monto > 100;
`;

function configuracion() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizacionId: "org-1",
    tenantQlikId: "tenant-1",
    creadoPorUsuarioId: "user-1",
    nombre: "Ventas",
    flujoIdQlik: "flujo-1",
    flujoNombreSnapshot: "Ventas DF",
    destinoProveedor: "gcs",
    destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
    destinoNombreSnapshot: "TalendDescargados",
    automatizacionIdQlik: "auto-1",
    automatizacionNombreSnapshot: "Ventas",
    programar: true,
    estado: "activa" as const,
  };
}

function qlikConScripts(scripts: string[]) {
  let indice = 0;
  const workspaces: Record<string, unknown>[] = [];
  const qlik = {
    listarEjecuciones: vi.fn(async () => []),
    obtenerScriptApp: vi.fn(async () => ({
      script: scripts[Math.min(indice++, scripts.length - 1)] ?? SCRIPT_V1,
    })),
    obtenerAutomatizacion: vi.fn(async () => ({
      id: "auto-1",
      name: "Ventas",
      schedules: [{ legacy: true }],
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
    actualizarAutomatizacion: vi.fn(async (_id, definicion) => {
      workspaces.push(
        (definicion as { workspace: Record<string, unknown> }).workspace,
      );
      return { id: "auto-1", name: "Ventas", ...definicion };
    }),
    ejecutarAutomatizacion: vi.fn(async () => ({ runId: `run-${indice}` })),
  } as unknown as ServicioQlik;
  return { qlik, workspaces };
}

function extraerKv(
  workspace: Record<string, unknown>,
  clave: string,
): string | undefined {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;
    if ((block as Record<string, unknown>).name !== "executeTask") continue;
    const inputs = Array.isArray((block as Record<string, unknown>).inputs)
      ? ((block as Record<string, unknown>).inputs as unknown[])
      : [];
    for (const input of inputs) {
      if (typeof input !== "object" || input === null) continue;
      const values = Array.isArray((input as Record<string, unknown>).value)
        ? ((input as Record<string, unknown>).value as Array<
            Record<string, unknown>
          >)
        : [];
      const item = values.find((valor) => valor.key === clave);
      if (typeof item?.value === "string") return item.value;
    }
  }
  return undefined;
}

describe("pipeline Dataflow → Automate → Talend", () => {
  it("dos ejecuciones releen current y auditan hashes/SQL/scripts distintos", async () => {
    const { qlik, workspaces } = qlikConScripts([SCRIPT_V1, SCRIPT_V2]);
    const auditorias: Array<Record<string, unknown>> = [];
    let id = 0;
    const repo = {
      obtenerPorAutomatizacion: async () => configuracion(),
      crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
        auditorias.push(entrada);
        return entrada;
      }),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const caso = new EjecutarReporte(
      qlik,
      repo as never,
      {
        ejecutarExclusivo: async (
          _clave: string,
          tarea: () => Promise<unknown>,
        ) => tarea(),
      } as never,
      { projectId: "p", dataset: "d" },
      () => `22222222-2222-4222-8222-${String(++id).padStart(12, "0")}`,
    );

    await caso.ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
      tipo: "manual",
    });
    await caso.ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
      tipo: "manual",
    });

    expect(qlik.obtenerScriptApp).toHaveBeenCalledTimes(2);
    expect(auditorias).toHaveLength(2);
    expect(auditorias[0]?.hashDataflowSha256).not.toBe(
      auditorias[1]?.hashDataflowSha256,
    );
    expect(auditorias[0]?.sqlBigQueryCompilado).not.toBe(
      auditorias[1]?.sqlBigQueryCompilado,
    );
    expect(auditorias[0]?.scriptDataflow).toBe(SCRIPT_V1);
    expect(auditorias[1]?.scriptDataflow).toBe(SCRIPT_V2);
    expect(extraerKv(workspaces[0] ?? {}, "gcp_script")).toContain(
      "EXPORT DATA",
    );
    expect(extraerKv(workspaces[1] ?? {}, "gcp_script")).toContain(
      "monto > 100",
    );
    expect(extraerKv(workspaces[0] ?? {}, "gcp_dataflow_hash")).not.toBe(
      extraerKv(workspaces[1] ?? {}, "gcp_dataflow_hash"),
    );
    expect(qlik.actualizarAutomatizacion).toHaveBeenNthCalledWith(
      1,
      "auto-1",
      expect.objectContaining({ schedules: [] }),
    );
  });

  it("manual y programada llegan al mismo formato de auditoría y gcp_script", async () => {
    const manual = qlikConScripts([SCRIPT_V1]);
    const programada = qlikConScripts([SCRIPT_V1]);
    const tipos: string[] = [];
    const repoBase = {
      obtenerPorAutomatizacion: async () => configuracion(),
      crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
        tipos.push(String(entrada.tipoEjecucion));
        expect(String(entrada.scriptExportacion)).toContain("EXPORT DATA");
        expect(String(entrada.uriBaseGcs)).toMatch(
          /^gs:\/\/bkt_dwh\/POCs\/TalendDescargados\//,
        );
        return entrada;
      }),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const lock = {
      ejecutarExclusivo: async (
        _clave: string,
        tarea: () => Promise<unknown>,
      ) => tarea(),
    } as never;

    await new EjecutarReporte(
      manual.qlik,
      repoBase as never,
      lock,
      { projectId: "p", dataset: "d" },
      () => "33333333-3333-4333-8333-333333333333",
    ).ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
      tipo: "manual",
    });

    const repoProgramado = {
      ...repoBase,
      listarProgramacionesVencidas: async () => [
        {
          id: "prog-1",
          configuracionId: configuracion().id,
          expresionCron: "0 8 * * *",
          zonaHoraria: "America/Guayaquil",
          proximaEjecucionEn: new Date("2026-08-14T13:00:00Z"),
          activa: true,
        },
      ],
      intentarReclamarProgramacion: async () => true,
      obtenerConfiguracionPorId: async () => configuracion(),
    };
    await new ProgramadorReportes(
      repoProgramado as never,
      lock,
      async () => ({
        qlik: programada.qlik,
        alcanceBigQuery: { projectId: "p", dataset: "d" },
      }),
      () => "44444444-4444-4444-8444-444444444444",
    ).ejecutarPendientes(new Date("2026-08-14T18:00:00Z"));

    expect(tipos).toEqual(["manual", "programada"]);
    expect(extraerKv(manual.workspaces[0] ?? {}, "gcp_script")).toContain(
      "EXPORT DATA",
    );
    expect(extraerKv(programada.workspaces[0] ?? {}, "gcp_script")).toContain(
      "EXPORT DATA",
    );
  });
});

import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { EjecutarReporte } from "./ejecutar-reporte.js";

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
    automatizacionIdQlik: "auto-1",
    automatizacionNombreSnapshot: "Ventas",
    estado: "activa" as const,
  };
}

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
      schedules: [],
      workspace: await workspaceTalend(),
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

describe("pipeline Dataflow → Automate → Talend", () => {
  it("dos ejecuciones releen current y generan queries Talend distintas", async () => {
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
    });
    await caso.ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
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
    expect(valorVariable(workspaces[0] ?? {}, "BqSelectData")).toContain(
      "monto > 0",
    );
    expect(valorVariable(workspaces[1] ?? {}, "BqSelectData")).toContain(
      "monto > 100",
    );
    expect(valorVariable(workspaces[0] ?? {}, "BqSelectData")).not.toBe(
      valorVariable(workspaces[1] ?? {}, "BqSelectData"),
    );
    expect(valorVariable(workspaces[0] ?? {}, "Credenciales")).toBe(
      "CREDENCIAL_SANITIZADA",
    );
  });

  it("inyecta las cuatro queries Talend derivadas del Dataflow real", async () => {
    const real = new URL(
      "../fixtures/dataflow-bigquery-filtro-fecha-real.qlik",
      import.meta.url,
    );
    const scriptReal = await Bun.file(real).text();
    const { qlik, workspaces } = qlikConScripts([scriptReal]);
    const auditorias: Array<Record<string, unknown>> = [];
    const repo = {
      obtenerPorAutomatizacion: async () => configuracion(),
      crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => {
        auditorias.push(entrada);
        return entrada;
      }),
      marcarEjecucionIniciada: vi.fn(async () => undefined),
      marcarEjecucionError: vi.fn(async () => undefined),
    };
    const ejecucionId = "33333333-3333-4333-8333-333333333333";
    const caso = new EjecutarReporte(
      qlik,
      repo as never,
      {
        ejecutarExclusivo: async (
          _clave: string,
          tarea: () => Promise<unknown>,
        ) => tarea(),
      } as never,
      { projectId: "poc-bigquery-talend", dataset: "demo_lafavorita" },
      () => ejecucionId,
    );

    await caso.ejecutar({
      tenantId: "tenant-1",
      organizacionId: "org-1",
      automatizacionIdQlik: "auto-1",
    });

    const auditoria = auditorias[0];
    const workspace = workspaces[0] ?? {};
    expect(auditoria?.sqlBigQueryCompilado).toContain(
      "WHERE `Fecha` = DATE '2026-06-01'",
    );
    expect(auditoria?.uriBaseGcs).toBe(
      `gs://bkt_dwh/POCs/TalendDescargados/ventas/${ejecucionId}/`,
    );
    expect(valorVariable(workspace, "BqSelectData")).toContain(
      "WHERE `Fecha` = DATE '2026-06-01'",
    );
    expect(valorVariable(workspace, "BqExportData")).toContain(
      `uri = 'gs://bkt_dwh/POCs/TalendDescargados/ventas/${ejecucionId}/parte-__PART_PADDED__-*.csv.gz'`,
    );
    expect(valorVariable(workspace, "BqNumberCsv")).toContain(
      "SELECT DISTINCT export_part",
    );
    expect(valorVariable(workspace, "BqDrop")).toContain(
      "DROP TABLE IF EXISTS",
    );
    expect(String(auditoria?.scriptExportacion)).not.toContain(
      "STORE [Filtro 1_DEFAULT]",
    );
  });
});

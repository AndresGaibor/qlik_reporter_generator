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
    destinoProveedor: "gcs",
    destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
    destinoNombreSnapshot: "TalendDescargados",
    automatizacionIdQlik: "auto-1",
    automatizacionNombreSnapshot: "Ventas",
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
  it("inyecta en gcp_script el SQL y la ruta GCS derivados del Dataflow real", async () => {
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
    const gcpScript = extraerKv(workspaces[0] ?? {}, "gcp_script");
    expect(auditoria?.sqlBigQueryCompilado).toContain(
      "WHERE `Fecha` = DATE '2026-06-01'",
    );
    expect(auditoria?.uriBaseGcs).toBe(
      `gs://bkt_dwh/POCs/TalendDescargados/ventas/${ejecucionId}/`,
    );
    expect(gcpScript).toContain("WHERE `Fecha` = DATE '2026-06-01'");
    expect(gcpScript).toContain(
      `uri = 'gs://bkt_dwh/POCs/TalendDescargados/ventas/${ejecucionId}/parte-%s-*.csv.gz'`,
    );
    expect(gcpScript).not.toContain("STORE [Filtro 1_DEFAULT]");
  });

});

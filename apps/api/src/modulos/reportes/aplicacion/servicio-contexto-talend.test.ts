import { describe, expect, it } from "bun:test";
import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";
import {
  diagnosticarContratoTalend,
  inyectarContextoTalend,
} from "./servicio-contexto-talend.js";

const consultas: ConsultasTalendBigQuery = {
  sql: 'EXPORT DATA OPTIONS(uri="gs://b/parte-*.csv.gz", compression="GZIP") AS SELECT 1',
  jobId: "qlikr_e410c97de580245000008dc8ee2d4",
  projectId: "bq-project-123",
};

function valorVariable(workspace: Record<string, unknown>, nombre: string) {
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
  return setValue?.value;
}

async function cargarFixtureSqlActual() {
  const fixture = new URL(
    "../fixtures/automate-talend-workspace-sql.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("contrato Talend moderno", () => {
  it("inyecta únicamente SQL, job y proyecto", async () => {
    const workspace = await cargarFixtureSqlActual();
    expect(diagnosticarContratoTalend(workspace)).toEqual([]);

    const nuevo = inyectarContextoTalend(workspace, consultas);
    expect(valorVariable(nuevo, "sql")).toBe(consultas.sql);
    expect(valorVariable(nuevo, "jobid")).toBe(consultas.jobId);
    expect(valorVariable(nuevo, "projectid")).toBe(consultas.projectId);
    expect(valorVariable(nuevo, "Credenciales")).toBe(
      "/etc/credentials/gsc.json",
    );
  });

  it("rechaza si falta un contexto moderno requerido", async () => {
    const workspace = await cargarFixtureSqlActual();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    const executeTask = blocks.find(
      (block) => block.name === "executeTask",
    ) as Record<string, unknown>;
    const inputs = executeTask.inputs as Array<Record<string, unknown>>;
    const contexto = inputs.find(
      (input) => input.mode === "keyValue",
    ) as Record<string, unknown>;
    contexto.value = (contexto.value as Array<Record<string, unknown>>).filter(
      (item) => item.key !== "sql",
    );

    expect(() => inyectarContextoTalend(workspace, consultas)).toThrow("sql");
  });

  it("enumera los bloques modernos faltantes", async () => {
    const workspace = await cargarFixtureSqlActual();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    workspace.blocks = blocks.filter((block) => block.name !== "projectid");

    expect(diagnosticarContratoTalend(workspace)).toEqual(
      expect.arrayContaining(['Falta el bloque "projectid"']),
    );
  });
});

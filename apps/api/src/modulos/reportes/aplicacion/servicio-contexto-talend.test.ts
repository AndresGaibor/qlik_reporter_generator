import { describe, expect, it } from "bun:test";
import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";
import {
  diagnosticarContratoTalend,
  inyectarContextoTalend,
} from "./servicio-contexto-talend.js";

const consultas: ConsultasTalendBigQuery = {
  bqNumberCsv: "SELECT 0 AS export_part",
  bqExportData:
    "EXPORT DATA OPTIONS(uri='gs://b/parte-__PART_PADDED__-*.csv.gz') AS SELECT 1",
};

function valorVariable(
  workspace: Record<string, unknown>,
  nombre: string,
): unknown {
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

async function cargarFixture() {
  const fixture = new URL(
    "../fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("inyectarContextoTalend", () => {
  it("actualiza únicamente los dos VariableBlocks que espera el Job", async () => {
    const workspace = await cargarFixture();
    const nuevo = inyectarContextoTalend(
      workspace,
      consultas,
      '{"type":"service_account","project_id":"configurado"}',
    );

    expect(valorVariable(nuevo, "BqNumberCsv")).toBe(consultas.bqNumberCsv);
    expect(valorVariable(nuevo, "BqExportData")).toBe(consultas.bqExportData);
    expect(valorVariable(nuevo, "Credenciales")).toBe(
      '{"type":"service_account","project_id":"configurado"}',
    );
  });

  it("valida que executeTask referencie los dos contextos del Job", async () => {
    const workspace = await cargarFixture();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    const executeTask = blocks.find(
      (block) => block.name === "executeTask",
    ) as Record<string, unknown>;
    const inputs = executeTask.inputs as Array<Record<string, unknown>>;
    const contexto = inputs.find(
      (input) => input.mode === "keyValue",
    ) as Record<string, unknown>;
    const values = contexto.value as Array<Record<string, unknown>>;
    contexto.value = values.filter((item) => item.key !== "bq_export_data");

    expect(() => inyectarContextoTalend(workspace, consultas, "{}")).toThrow(
      "bq_export_data",
    );
  });

  it("falla si falta alguno de los VariableBlocks requeridos", async () => {
    const workspace = await cargarFixture();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    workspace.blocks = blocks.filter((block) => block.name !== "BqExportData");

    expect(() => inyectarContextoTalend(workspace, consultas, "{}")).toThrow(
      "BqExportData",
    );
  });
});

describe("diagnosticarContratoTalend", () => {
  it("enumera todos los VariableBlocks faltantes", async () => {
    const workspace = await cargarFixture();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    workspace.blocks = blocks.filter((block) => block.name !== "BqExportData");

    expect(diagnosticarContratoTalend(workspace)).toEqual(
      expect.arrayContaining(['Falta el bloque "BqExportData"']),
    );
  });
});

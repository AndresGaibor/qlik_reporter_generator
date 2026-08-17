import { describe, expect, it } from "bun:test";
import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";
import { inyectarContextoTalend } from "./servicio-contexto-talend.js";

const consultas: ConsultasTalendBigQuery = {
  bqSelectData: "CREATE OR REPLACE TABLE `p.d.staging` AS SELECT 1",
  bqNumberCsv: "SELECT DISTINCT export_part FROM `p.d.staging`",
  bqExportData:
    "EXPORT DATA OPTIONS(uri='gs://b/parte-__PART_PADDED__-*.csv.gz') AS SELECT 1",
  bqDrop: "DROP TABLE IF EXISTS `p.d.staging`",
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
  it("actualiza únicamente los cuatro VariableBlocks que espera Prueba_BigQuery", async () => {
    const workspace = await cargarFixture();
    const nuevo = inyectarContextoTalend(workspace, consultas);

    expect(valorVariable(nuevo, "BqSelectData")).toBe(consultas.bqSelectData);
    expect(valorVariable(nuevo, "BqNumberCsv")).toBe(consultas.bqNumberCsv);
    expect(valorVariable(nuevo, "BqExportData")).toBe(consultas.bqExportData);
    expect(valorVariable(nuevo, "BqDrop")).toBe(consultas.bqDrop);
    expect(valorVariable(nuevo, "Credenciales")).toBe("CREDENCIAL_SANITIZADA");
    expect(valorVariable(workspace, "BqSelectData")).toBe("SELECT_ANTERIOR");
  });

  it("valida que executeTask referencie exactamente los cuatro contextos del Job", async () => {
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
    contexto.value = values.filter((item) => item.key !== "bq_drop");

    expect(() => inyectarContextoTalend(workspace, consultas)).toThrow(
      "bq_drop",
    );
  });

  it("falla si falta alguno de los VariableBlocks requeridos", async () => {
    const workspace = await cargarFixture();
    const blocks = workspace.blocks as Array<Record<string, unknown>>;
    workspace.blocks = blocks.filter((block) => block.name !== "BqExportData");

    expect(() => inyectarContextoTalend(workspace, consultas)).toThrow(
      "BqExportData",
    );
  });
});

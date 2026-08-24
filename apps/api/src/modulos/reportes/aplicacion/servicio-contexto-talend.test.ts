import { describe, expect, it } from "bun:test";
import type { ConsultasTalendBigQuery } from "./consultas-talend-bigquery.js";
import {
  diagnosticarContratoTalend,
  inyectarContextoTalend,
} from "./servicio-contexto-talend.js";

const consultas: ConsultasTalendBigQuery = {
  sql: 'EXPORT DATA OPTIONS(uri="gs://b/parte-*.csv.gz", compression="GZIP") AS SELECT 1',
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

function workspacePlantillaSqlActual(): Record<string, unknown> {
  return {
    blocks: [
      {
        name: "executeTask",
        type: "EndpointBlock",
        inputs: [
          {
            id: "context",
            mode: "keyValue",
            value: [
              { key: "jobid", value: "{ $.jobid }" },
              { key: "projectid", value: "{ $.projectid }" },
              { key: "credenciales", value: "{ $.Credenciales }" },
              { key: "sql", value: "{ $.sql }" },
            ],
          },
        ],
      },
      ...["jobid", "projectid", "Credenciales", "sql"].map((name) => ({
        name,
        type: "VariableBlock",
        operations: [
          {
            id: "set_value",
            value:
              name === "Credenciales"
                ? "/etc/credentials/gsc.json"
                : `ANTERIOR_${name}`,
          },
        ],
      })),
    ],
  };
}

async function cargarFixture() {
  const fixture = new URL(
    "../fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("inyectarContextoTalend", () => {
  it("acepta la plantilla actual con una sola variable sql y solo reemplaza su SQL", () => {
    const workspace = workspacePlantillaSqlActual();

    expect(diagnosticarContratoTalend(workspace)).toEqual([]);

    const nuevo = inyectarContextoTalend(workspace, consultas);
    expect(valorVariable(nuevo, "sql")).toBe(consultas.sql);
    expect(valorVariable(nuevo, "jobid")).toBe("ANTERIOR_jobid");
    expect(valorVariable(nuevo, "projectid")).toBe("ANTERIOR_projectid");
    expect(valorVariable(nuevo, "Credenciales")).toBe(
      "/etc/credentials/gsc.json",
    );
  });

  it("actualiza únicamente los dos VariableBlocks que espera el Job", async () => {
    const workspace = await cargarFixture();
    const nuevo = inyectarContextoTalend(workspace, consultas);

    expect(valorVariable(nuevo, "BqNumberCsv")).toBe(consultas.bqNumberCsv);
    expect(valorVariable(nuevo, "BqExportData")).toBe(consultas.bqExportData);
    expect(valorVariable(nuevo, "Credenciales")).toBe(
      "/etc/credentials/gsc.json",
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

    expect(() => inyectarContextoTalend(workspace, consultas)).toThrow(
      "bq_export_data",
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

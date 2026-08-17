import { describe, expect, it } from "bun:test";
import { inyectarContextoTalend } from "./servicio-contexto-talend.js";

function leerKv(
  workspace: Record<string, unknown>,
  bloqueNombre: string,
  clave: string,
): unknown {
  const blocks = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  const block = blocks.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as Record<string, unknown>).name === bloqueNombre,
  ) as Record<string, unknown> | undefined;
  const inputs = Array.isArray(block?.inputs) ? block.inputs : [];
  for (const input of inputs) {
    if (typeof input !== "object" || input === null) continue;
    const obj = input as Record<string, unknown>;
    if (obj.mode !== "keyValue" || !Array.isArray(obj.value)) continue;
    const item = (obj.value as Array<Record<string, unknown>>).find(
      (entry) => entry.key === clave,
    );
    if (item) return item.value;
  }
  return undefined;
}

describe("inyectarContextoTalend", () => {
  it("actualiza únicamente executeTask y no muta el workspace original", () => {
    const workspace = {
      blocks: [
        {
          name: "executeTask",
          type: "EndpointBlock",
          inputs: [
            {
              mode: "keyValue",
              value: [{ key: "gcp_script", value: "anterior" }],
            },
          ],
        },
        {
          name: "otroEndpoint",
          type: "EndpointBlock",
          inputs: [{ mode: "keyValue", value: [] }],
        },
      ],
    };

    const nuevo = inyectarContextoTalend(workspace, {
      gcp_script: "DECLARE max_rows INT64 DEFAULT 1000000; EXPORT DATA",
      gcp_dataflow_hash: "a".repeat(64),
    });

    expect(leerKv(nuevo, "executeTask", "gcp_script")).toContain("EXPORT DATA");
    expect(leerKv(nuevo, "executeTask", "gcp_dataflow_hash")).toBe(
      "a".repeat(64),
    );
    expect(leerKv(nuevo, "otroEndpoint", "gcp_script")).toBeUndefined();
    expect(leerKv(workspace, "executeTask", "gcp_script")).toBe("anterior");
  });

  it("falla si la plantilla no contiene executeTask key/value", () => {
    expect(() =>
      inyectarContextoTalend({ blocks: [] }, { gcp_script: "SELECT 1" }),
    ).toThrow("executeTask");
  });
});

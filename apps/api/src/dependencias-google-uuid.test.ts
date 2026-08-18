import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dependencyRequire(dependency: string) {
  const storageEntry = require.resolve("@google-cloud/storage", {
    paths: [resolve(ROOT, "apps/api")],
  });
  const dependencyEntry = require.resolve(dependency, {
    paths: [dirname(storageEntry)],
  });
  let packageRoot = dirname(dependencyEntry);
  while (
    packageRoot !== dirname(packageRoot) &&
    !existsSync(resolve(packageRoot, "package.json"))
  ) {
    packageRoot = dirname(packageRoot);
  }
  const packageJson = JSON.parse(
    readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
  );
  return {
    require: createRequire(dependencyEntry),
    version: packageJson.version,
  };
}

describe("compatibilidad UUID de dependencias Google", () => {
  test("el override raíz fija uuid 11.1.1 exactamente", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf-8"),
    );

    expect(packageJson.overrides.uuid).toBe("11.1.1");
  });

  test("gaxios 6.7.1 puede resolver uuid y generar UUID v4 por CommonJS", () => {
    const gaxios = dependencyRequire("gaxios");
    const uuid = gaxios.require("uuid");

    expect(gaxios.version).toBe("6.7.1");
    expect(uuid.v4()).toMatch(UUID_V4);
  });

  test("teeny-request 9.0.0 puede resolver uuid y generar UUID v4 por CommonJS", () => {
    const teenyRequest = dependencyRequire("teeny-request");
    const uuid = teenyRequest.require("uuid");

    expect(teenyRequest.version).toBe("9.0.0");
    expect(uuid.v4()).toMatch(UUID_V4);
  });
});

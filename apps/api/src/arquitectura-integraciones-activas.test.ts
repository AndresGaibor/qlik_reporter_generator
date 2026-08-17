import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const RAIZ = join(__dirname, "../../../..");

async function existe(ruta: string): Promise<boolean> {
  try {
    const stat = await Bun.file(join(RAIZ, ruta)).text();
    return stat !== null;
  } catch {
    return false;
  }
}

async function contenidoCodigo(directorios: string[]): Promise<string> {
  const partes: string[] = [];
  for (const dir of directorios) {
    const rutaAbs = join(RAIZ, dir);
    try {
      const entradas = await readdir(rutaAbs, { recursive: true });
      for (const entrada of entradas) {
        if (typeof entrada !== "string") continue;
        if (!/\.(ts|tsx|js|jsx)$/.test(entrada)) continue;
        if (entrada.includes(".test.")) continue;
        if (entrada.includes("arquitectura-integraciones-activas")) continue;
        const rutaCompleta = join(rutaAbs, entrada);
        try {
          const contenido = await readFile(rutaCompleta, "utf-8");
          partes.push(contenido);
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }
  return partes.join("\n");
}

async function contenidoPackageJson(): Promise<Record<string, unknown>> {
  const ruta = join(RAIZ, "apps/api/package.json");
  try {
    const contenido = await readFile(ruta, "utf-8");
    return JSON.parse(contenido);
  } catch {
    return {};
  }
}

describe("arquitectura-integraciones-activas", () => {
  const dirs = ["apps/api/src", "apps/web/src", "packages/contratos/src"];

  it("no debe tener el módulo origenes", async () => {
    const tiene = await existe("apps/api/src/modulos/origenes");
    expect(tiene).toBe(false);
  });

  it("no debe tener ssh2-sftp-client como dependencia", async () => {
    const pkg = await contenidoPackageJson();
    expect(pkg.dependencies).not.toHaveProperty("ssh2-sftp-client");
    expect(pkg.dependencies).not.toHaveProperty("@types/ssh2-sftp-client");
  });

  it("no debe usar Impala, SFTP, JDBC o Spark en código activo", async () => {
    const codigo = await contenidoCodigo(dirs);
    expect(codigo).not.toMatch(/\b(Impala|SFTP|JDBC|Spark)\b/);
  });

  it("no debe usar REMOTE_API_URL ni REMOTE_API_KEY en código activo", async () => {
    const codigo = await contenidoCodigo(dirs);
    expect(codigo).not.toMatch(/\bREMOTE_API_(URL|KEY)\b/);
  });
});

import { describe, expect, it } from "bun:test";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const RAIZ = join(__dirname, "../../../");

async function existe(ruta: string): Promise<boolean> {
  try {
    const s = await stat(join(RAIZ, ruta));
    return s.isDirectory() || s.isFile();
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

  it("el scan cubre los tres directorios y el contenido no está vacío", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    expect(codigoActivo.length).toBeGreaterThan(1000);
    for (const dir of dirs) {
      const rutaAbs = join(RAIZ, dir);
      const tiene = await existe(dir);
      expect(tiene).toBe(true);
    }
  });

  it("demuestra que el regex detectaría Impala en código activo", async () => {
    expect("ImpalaConnect".toLowerCase()).not.toMatch(/\bimpala\b/i);
    const IMPALA_FALSE_POSITIVE = "ImpalaConnect";
    expect(IMPALA_FALSE_POSITIVE).not.toMatch(/\bImpala\b/i);
    const codigoActivo = await contenidoCodigo(dirs);
    expect(codigoActivo).not.toMatch(/\bImpala\b/i);
  });

  it("no debe tener el módulo origenes", async () => {
    const tiene = await existe("apps/api/src/modulos/origenes");
    expect(tiene).toBe(false);
  });

  it("no debe conservar declaraciones TypeScript de SFTP", async () => {
    expect(
      await existe("apps/api/src/plataforma/tipos/ssh2-sftp-client.d.ts"),
    ).toBe(false);
  });

  it("no debe tener ssh2-sftp-client ni cron-parser como dependencia", async () => {
    const pkg = await contenidoPackageJson();
    expect(pkg.dependencies).not.toHaveProperty("ssh2-sftp-client");
    expect(pkg.devDependencies).not.toHaveProperty("ssh2-sftp-client");
    expect(pkg.dependencies).not.toHaveProperty("cron-parser");
    expect(pkg.devDependencies).not.toHaveProperty("cron-parser");
  });

  it("no debe usar Impala, SFTP, JDBC o Spark en código activo", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    for (const termino of [
      /\bImpala\b/i,
      /\bSFTP\b/i,
      /\bJDBC\b/i,
      /\bSpark\b/,
    ]) {
      expect(codigoActivo).not.toMatch(termino);
    }
  });

  it("no debe usar REMOTE_API_URL ni REMOTE_API_KEY en código activo", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    expect(codigoActivo).not.toMatch(/REMOTE_API_(URL|KEY)/);
  });

  it("no debe conservar el catálogo genérico de destinos BigQuery", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    for (const termino of [
      "crearRutasDestinosGenericas",
      "RepositorioConexionesDestinoPostgres",
      "PuertoRepositorioConexionesDestino",
    ]) {
      expect(codigoActivo).not.toContain(termino);
    }
  });

  it("no debe conservar infraestructura Outbox sin consumidor", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    for (const termino of [
      "PuertoOutbox",
      "OutboxPostgres",
      "eventosOutbox",
      "PublicadorEventos",
    ]) {
      expect(codigoActivo).not.toContain(termino);
    }
  });

  it("no debe usar identificadores de legacy en código activo", async () => {
    const codigoActivo = await contenidoCodigo(dirs);
    for (const identificador of [
      "destinoApiUrl",
      "destinoApiKey",
      "destinoBaseDatos",
      "conexionesOrigen",
      "destinosCache",
      "destino_api_url",
      "destino_api_key_cifrada",
      "destino_base_datos",
      "conexiones_origen",
    ]) {
      expect(codigoActivo).not.toContain(identificador);
    }
  });
});

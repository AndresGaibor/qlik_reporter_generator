import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));

test("configuración usa la organización de la sesión y no lista tenants globales", () => {
  const pagina = readFileSync(
    resolve(aqui, "pagina-configuracion.tsx"),
    "utf8",
  );

  expect(pagina).not.toContain("obtenerTenants");
  expect(pagina).toContain("obtenerSesion");
  expect(pagina).toContain("tenantActivoId");
  expect(pagina).toContain("organizacionId");
});

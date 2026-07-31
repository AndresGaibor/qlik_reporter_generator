import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const detallePath = resolve(
  process.cwd(),
  "src/modulos/flujos/pagina-detalle-flujo.tsx",
);
const catalogoPath = resolve(
  process.cwd(),
  "src/modulos/origenes/pagina-catalogo-origen.tsx",
);

test("retira el catálogo técnico de conexiones del frontend", () => {
  const fuente = readFileSync(detallePath, "utf8");

  expect(fuente).not.toContain("urlCatalogoConexiones");
  expect(fuente).not.toContain("Ir a Configuración de Conexiones");
  expect(fuente).not.toContain("catálogo técnico de conexiones");
  expect(existsSync(catalogoPath)).toBe(false);
});

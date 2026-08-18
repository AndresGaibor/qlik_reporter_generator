import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const detallePath = resolve(aqui, "pagina-detalle-flujo.tsx");
const catalogoPath = resolve(
  aqui,
  "../origenes/pagina-catalogo-origen.tsx",
);

test("retira el catálogo técnico de conexiones del frontend", () => {
  const fuente = readFileSync(detallePath, "utf8");

  expect(fuente).not.toContain("urlCatalogoConexiones");
  expect(fuente).not.toContain("Ir a Configuración de Conexiones");
  expect(fuente).not.toContain("catálogo técnico de conexiones");
  expect(existsSync(catalogoPath)).toBe(false);
});

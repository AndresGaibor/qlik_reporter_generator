import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const admin = aqui;
const componentes = resolve(admin, "componentes");

test("la configuración elimina el administrador genérico y conserva BigQuery", () => {
  const pagina = readFileSync(
    resolve(admin, "pagina-detalle-tenant.tsx"),
    "utf8",
  );
  const plantilla = readFileSync(
    resolve(componentes, "seccion-automatizacion-base-tenant.tsx"),
    "utf8",
  );

  expect(pagina).not.toContain("SeccionConfigurarDestinosTenant");
  expect(pagina).toContain("SeccionBigQuery");
  expect(existsSync(resolve(componentes, "seccion-bigquery.tsx"))).toBe(true);
  expect(plantilla).not.toContain("Conexión de destino");
  expect(plantilla).not.toContain("Agregar destino");
  expect(
    existsSync(resolve(componentes, "seccion-configurar-destinos-tenant.tsx")),
  ).toBe(false);
  expect(
    existsSync(resolve(componentes, "seccion-configurar-impala-tenant.tsx")),
  ).toBe(false);
  expect(existsSync(resolve(componentes, "seccion-setup-tecnico.tsx"))).toBe(
    false,
  );
});

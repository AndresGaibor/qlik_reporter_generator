import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const ruta = resolve(
  process.cwd(),
  "src/modulos/reportes/pagina-nueva-automatizacion.tsx",
);

test("el creador usa exclusivamente la conexión BigQuery", () => {
  const fuente = readFileSync(ruta, "utf8");
  expect(fuente).toContain('conexion.tipo === "bigquery"');
  expect(fuente).toContain("conexionesBigQuery");
  expect(fuente).not.toContain(
    "const conexionActiva = conexiones.find((conexion) => conexion.esPredeterminada) ?? conexiones[0]",
  );
});

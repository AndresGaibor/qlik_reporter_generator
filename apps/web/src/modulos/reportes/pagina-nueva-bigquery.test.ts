import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const ruta = resolve(
  process.cwd(),
  "src/modulos/reportes/pagina-nueva-automatizacion.tsx",
);

test("el creador usa Dataflow y delega BigQuery al preflight del backend", () => {
  const fuente = readFileSync(ruta, "utf8");
  expect(fuente).toContain("obtenerFlujosConFiltros");
  expect(fuente).toContain("preflightDataflowReporte");
  expect(fuente).toContain("gs://bkt_dwh/POCs/TalendDescargados/");
  expect(fuente).not.toContain("obtenerConexionesDestino");
  expect(fuente).not.toContain("obtenerRecursosDestino");
  expect(fuente).not.toContain("DayPicker");
});

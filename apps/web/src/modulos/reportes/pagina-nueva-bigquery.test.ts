import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const ruta = resolve(aqui, "pagina-nuevo-reporte.tsx");

test("el creador usa Dataflow y delega BigQuery al preflight del backend", () => {
  const fuente = readFileSync(ruta, "utf8");
  expect(fuente).toContain("obtenerFlujosConFiltros");
  expect(fuente).toContain("preflightDataflowReporte");
  expect(fuente).toContain("gs://bkt_dwh/POCs/TalendDescargados/");
  expect(fuente).not.toContain("obtenerConexionesDestino");
  expect(fuente).not.toContain("obtenerRecursosDestino");
  expect(fuente).not.toContain("DayPicker");
});

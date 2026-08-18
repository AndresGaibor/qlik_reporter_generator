import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const ruta = resolve(aqui, "pagina-tablas-destino.tsx");

test("la página es un orquestador de solo lectura sin simulaciones", () => {
  const fuente = readFileSync(ruta, "utf8");
  const lineas = fuente.split("\n").length;

  expect(fuente).toContain("obtenerConfiguracionBigQuery");
  expect(fuente).toContain("CatalogoResultados");
  expect(fuente).toContain("DetalleResultado");
  expect(fuente).toContain("EstadoResultados");
  expect(fuente).toContain("function MarcoResultados");
  expect((fuente.match(/<MarcoResultados/g) ?? []).length).toBeGreaterThan(4);
  expect(fuente).not.toContain("obtenerConexionesDestino");
  expect(fuente).not.toContain("mutationSolicitarCrear");
  expect(fuente).not.toContain("modalCrearTabla");
  expect(fuente).not.toContain("Editar reporte");
  expect(fuente).not.toContain("Aprobación");
  expect(fuente).not.toContain("Historial de cambios");
  expect(fuente).not.toContain("slate-");
  expect(lineas).toBeLessThan(260);
});

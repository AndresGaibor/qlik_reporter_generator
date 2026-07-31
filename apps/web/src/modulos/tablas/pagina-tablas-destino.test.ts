import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const ruta = resolve(process.cwd(), "src/modulos/tablas/pagina-tablas-destino.tsx");

test("la página es un orquestador de solo lectura sin simulaciones", () => {
  const fuente = readFileSync(ruta, "utf8");
  const lineas = fuente.split("\n").length;

  expect(fuente).toContain("obtenerConfiguracionBigQuery");
  expect(fuente).toContain("CatalogoResultados");
  expect(fuente).toContain("DetalleResultado");
  expect(fuente).toContain("EstadoResultados");
  expect(fuente).not.toContain("obtenerConexionesDestino");
  expect(fuente).not.toContain("mutationSolicitarCrear");
  expect(fuente).not.toContain("modalCrearTabla");
  expect(fuente).not.toContain("Editar reporte");
  expect(fuente).not.toContain("Aprobación");
  expect(fuente).not.toContain("Historial de cambios");
  expect(fuente).not.toContain("slate-");
  expect(lineas).toBeLessThan(260);
});

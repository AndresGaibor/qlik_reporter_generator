import { describe, it, expect, vi, beforeEach } from "vitest";
import { VistaPreviaDataflow } from "./vista-previa-dataflow";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";

const SCRIPT_SIMPLE = [
  "LIB CONNECT TO [Google BigQuery:Produccion];",
  "[fuente1]: LOAD nombre, edad;",
  "SQL SELECT nombre, edad FROM `proyecto.dataset.fuente1`;",
].join("\n");

const SCRIPT_AGRUPADO = [
  "LIB CONNECT TO [Google BigQuery:Produccion];",
  "[ventas]: LOAD categoria, AVG(ventas) AS promedio GROUP BY categoria;",
  "SQL SELECT categoria, CAST(SUM(ventas) AS INT64) AS ventas FROM `proyecto.dataset.ventas` GROUP BY categoria;",
].join("\n");

const SCRIPT_JOIN = [
  "LIB CONNECT TO [Google BigQuery:Produccion];",
  "[izquierda]: LOAD id, nombre;",
  "SQL SELECT id, nombre FROM `proyecto.dataset.izquierda`;",
  "INNER JOIN([izquierda]) [derecha]: LOAD id, ventas;",
  "SQL SELECT id, ventas FROM `proyecto.dataset.derecha`;",
].join("\n");

describe("VistaPreviaDataflow", () => {
  let mockQlik: PuertoQlik;
  let mockBq: PuertoLecturaBigQuery;

  beforeEach(() => {
    mockQlik = {
      obtenerScriptApp: vi.fn().mockResolvedValue({
        script: SCRIPT_SIMPLE,
      }),
      validarScriptApp: vi.fn().mockResolvedValue({ errores: [], advertencias: [] }),
    } as unknown as PuertoQlik;

    mockBq = {
      obtenerFilasPreview: vi.fn().mockResolvedValue({
        columnas: ["nombre", "edad"],
        filas: [["Ana", "30"], ["Luis", "25"]],
      }),
    } as unknown as PuertoLecturaBigQuery;
  });

  it("nunca llama a createQueryJob del bigquery", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    await caso.ejecutar("flujo-1", "app-1");
    expect(mockBq.obtenerFilasPreview).toHaveBeenCalled();
    expect(typeof (mockBq as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
  });

  it("devuelve maximo 10 filas", async () => {
    mockBq.obtenerFilasPreview = vi.fn().mockResolvedValue({
      columnas: ["c1"],
      filas: Array.from({ length: 50 }, (_, i) => [`v${i}`]),
    });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.filas.length).toBeLessThanOrEqual(10);
  });

  it("marca contieneAgregaciones cuando hay operaciones de agregacion", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: SCRIPT_AGRUPADO,
    });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.contieneAgregaciones).toBe(true);
  });

  it("devuelve esMuestra true", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.esMuestra).toBe(true);
  });

  it("devuelve advertencias de join cuando no hay coincidencias", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: SCRIPT_JOIN,
    });
    mockBq.obtenerFilasPreview = vi.fn()
      .mockResolvedValueOnce({ columnas: ["id", "nombre"], filas: [["1", "Ana"]] })
      .mockResolvedValueOnce({ columnas: ["id", "ventas"], filas: [["2", "100"]] });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.advertencias.length).toBeGreaterThan(0);
  });
});

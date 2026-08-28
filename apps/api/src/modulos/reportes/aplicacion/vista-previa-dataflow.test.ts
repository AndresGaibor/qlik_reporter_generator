import { beforeEach, describe, expect, it, vi } from "bun:test";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { VistaPreviaDataflow } from "./vista-previa-dataflow";

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
      obtenerScriptApp: vi.fn().mockResolvedValue({ script: SCRIPT_SIMPLE }),
      validarScriptApp: vi
        .fn()
        .mockResolvedValue({ errores: [], advertencias: [] }),
    } as unknown as PuertoQlik;

    mockBq = {
      obtenerMetadataTabla: vi.fn().mockResolvedValue({
        columnas: [
          { nombre: "nombre", tipo: "STRING", modo: "NULLABLE" },
          { nombre: "edad", tipo: "INT64", modo: "NULLABLE" },
        ],
      }),
      obtenerFilasPreview: vi.fn().mockResolvedValue({
        columnas: ["nombre", "edad"],
        filas: [["PROVEEDOR REAL", "37"]],
      }),
    } as unknown as PuertoLecturaBigQuery;
  });

  it("combina metadata con HEAD de máximo 5 filas y conserva valores reales", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");

    expect(mockBq.obtenerMetadataTabla).toHaveBeenCalled();
    expect(
      (mockBq as unknown as { obtenerFilasPreview: ReturnType<typeof vi.fn> })
        .obtenerFilasPreview,
    ).toHaveBeenCalledWith("proyecto.dataset.fuente1", {
      maxFilas: 5,
      columnas: ["nombre", "edad"],
    });
    expect(resultado.filas[0]).toEqual(["PROVEEDOR REAL", "37"]);
    expect(resultado.filas.length).toBeGreaterThan(0);
    expect(resultado.esAproximacion).toBe(true);
    expect(resultado.filasReferencia).toBe(1);
    expect(resultado.fuentesReferencia).toEqual(["proyecto.dataset.fuente1"]);
    expect(resultado.origenMuestra).toBe("referencia");
  });

  it("devuelve máximo 10 filas", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.filas.length).toBeLessThanOrEqual(10);
  });

  it("rellena sintéticamente las celdas que el evaluador no puede resolver", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: [
        "LIB CONNECT TO [Google BigQuery:Produccion];",
        "[fuente1]: LOAD nombre;",
        "SQL SELECT nombre FROM `proyecto.dataset.fuente1`;",
        "[salida]: LOAD [campo_que_no_existe] AS [Bodega], [otro_inexistente] AS [Cantidad] RESIDENT [fuente1];",
      ].join("\n"),
    });
    mockBq.obtenerMetadataTabla = vi.fn().mockResolvedValue({
      columnas: [{ nombre: "nombre", tipo: "STRING" }],
    });

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.columnas).toEqual(["Bodega", "Cantidad"]);
    expect(resultado.filas[0]).toEqual(["Bodega 01", "24"]);
    expect(resultado.filas.flat()).not.toContain("");
  });

  it("marca contieneAgregaciones cuando hay operaciones de agregación", async () => {
    mockQlik.obtenerScriptApp = vi
      .fn()
      .mockResolvedValue({ script: SCRIPT_AGRUPADO });
    mockBq.obtenerMetadataTabla = vi.fn().mockResolvedValue({
      columnas: [
        { nombre: "categoria", tipo: "STRING", modo: "NULLABLE" },
        { nombre: "ventas", tipo: "NUMERIC", modo: "NULLABLE" },
      ],
    });

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );
    expect(resultado.contieneAgregaciones).toBe(true);
  });

  it("informa metadata no disponible pero construye fallback sintético desde el IR", async () => {
    mockBq.obtenerMetadataTabla = vi
      .fn()
      .mockRejectedValue(new Error("Tabla no encontrada"));

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.advertencias).toContainEqual(
      expect.stringContaining("Tabla no encontrada"),
    );
    expect(resultado.columnas).toEqual(["nombre", "edad"]);
    expect(resultado.filas.length).toBeGreaterThan(0);
  });

  it("pasa a BigQuery la referencia completa de una fuente", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: [
        "LIB CONNECT TO [Google BigQuery:Produccion];",
        "[ventas]: LOAD id;",
        "SQL SELECT id FROM `lafavorita-182519.EDWH_REP.ventas`;",
      ].join("\n"),
    });

    await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(mockBq.obtenerMetadataTabla).toHaveBeenCalledWith(
      "lafavorita-182519.EDWH_REP.ventas",
      expect.anything(),
    );
  });

  it("reconoce referencias calificadas con identificadores separados", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: [
        "LIB CONNECT TO [Google BigQuery:Produccion];",
        "[ventas]: LOAD id;",
        "SQL SELECT id FROM `lafavorita-182519`.EDWH_REP.ventas;",
      ].join("\n"),
    });

    await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(mockBq.obtenerMetadataTabla).toHaveBeenCalledWith(
      "lafavorita-182519.EDWH_REP.ventas",
      expect.anything(),
    );
  });

  it("usa fallback sintético cuando HEAD está vacío", async () => {
    (
      mockBq as unknown as { obtenerFilasPreview: ReturnType<typeof vi.fn> }
    ).obtenerFilasPreview = vi
      .fn()
      .mockResolvedValue({ columnas: ["nombre", "edad"], filas: [] });

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.filas.length).toBeGreaterThan(0);
    expect(resultado.filas.flat()).not.toContain("");
  });

  it("usa fallback sintético cuando HEAD falla", async () => {
    (
      mockBq as unknown as { obtenerFilasPreview: ReturnType<typeof vi.fn> }
    ).obtenerFilasPreview = vi
      .fn()
      .mockRejectedValue(new Error("HEAD no disponible"));

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.filas.length).toBeGreaterThan(0);
    expect(resultado.advertencias.join(" ")).toMatch(/HEAD no disponible/);
  });

  it("rellena columnas ausentes o vacías del HEAD con valores sintéticos", async () => {
    (
      mockBq as unknown as { obtenerFilasPreview: ReturnType<typeof vi.fn> }
    ).obtenerFilasPreview = vi.fn().mockResolvedValue({
      columnas: ["nombre"],
      filas: [["PROVEEDOR REAL"]],
    });

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.filas[0]?.[0]).toBe("PROVEEDOR REAL");
    expect(resultado.filas[0]?.[1]).toBeTruthy();
  });

  it("genera claves compatibles y un INNER JOIN sintético no queda vacío", async () => {
    mockQlik.obtenerScriptApp = vi
      .fn()
      .mockResolvedValue({ script: SCRIPT_JOIN });
    mockBq.obtenerMetadataTabla = vi
      .fn()
      .mockResolvedValueOnce({
        columnas: [
          { nombre: "id", tipo: "INT64", modo: "NULLABLE" },
          { nombre: "nombre", tipo: "STRING", modo: "NULLABLE" },
        ],
      })
      .mockResolvedValueOnce({
        columnas: [
          { nombre: "id", tipo: "INT64", modo: "NULLABLE" },
          { nombre: "ventas", tipo: "NUMERIC", modo: "NULLABLE" },
        ],
      });
    (
      mockBq as unknown as { obtenerFilasPreview: ReturnType<typeof vi.fn> }
    ).obtenerFilasPreview = vi
      .fn()
      .mockResolvedValueOnce({
        columnas: ["id", "nombre"],
        filas: [["824829", "PROVEEDOR REAL"]],
      })
      .mockResolvedValueOnce({
        columnas: ["id", "ventas"],
        filas: [["991288", "125.50"]],
      });

    const resultado = await new VistaPreviaDataflow(mockQlik, mockBq).ejecutar(
      "flujo-1",
      "app-1",
    );

    expect(resultado.filas.length).toBeGreaterThan(0);
    expect(resultado.filas.flat()).toContain("PROVEEDOR REAL");
    expect(resultado.filas.flat()).toContain("125.50");
    expect(resultado.advertencias.join(" ")).not.toMatch(
      /muestra|coincidencias/i,
    );
  });
});

import { describe, expect, it, vi } from "bun:test";
import { PreflightDataflow, sha256Texto } from "./preflight-dataflow.js";

const SCRIPT_OK = `
LIB CONNECT TO [Google BigQuery:Produccion];
[ventas]:
LOAD [Fecha], Upper([Categoria]) AS [Categoria];
SQL SELECT Fecha, Categoria
FROM \`proyecto.dataset.ventas\`
WHERE Fecha >= DATE('2026-08-01');
`;

describe("PreflightDataflow", () => {
  it("lee current, calcula hash, compila y estima BigQuery", async () => {
    const qlik = {
      obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT_OK })),
    };
    const estimador = {
      estimarConsulta: vi.fn(async () => ({
        bytesProcesados: 1234,
        costoEstimadoUsd: 0.01,
      })),
    };
    const caso = new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto",
      dataset: "dataset",
    });

    const resultado = await caso.ejecutar("flujo-1");

    expect(qlik.obtenerScriptApp).toHaveBeenCalledWith("flujo-1", "current");
    expect(resultado.hashDataflowSha256).toBe(await sha256Texto(SCRIPT_OK));
    expect(resultado.hashDataflowSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(resultado.compatible).toBe(true);
    expect(resultado.sqlBigQuery).toContain("SELECT");
    expect(resultado.sqlBigQuery).toContain("`proyecto.dataset.ventas`");
    expect(resultado.bytesProcesados).toBe(1234);
    expect(resultado.resumen).toMatchObject({
      fuentes: 1,
      filtros: 1,
      joins: 0,
      camposSalida: 2,
    });
    expect(estimador.estimarConsulta).toHaveBeenCalledTimes(1);
  });

  it("bloquea funciones no soportadas sin ejecutar dry-run", async () => {
    const qlik = {
      obtenerScriptApp: vi.fn(async () => ({
        script: `LIB CONNECT TO [Google BigQuery:Produccion]; [x]: LOAD ApplyMap('m',[id]) AS [x]; SQL SELECT id FROM \`proyecto.dataset.t\`;`,
      })),
    };
    const estimador = {
      estimarConsulta: vi.fn(async () => ({
        bytesProcesados: 1,
        costoEstimadoUsd: 0,
      })),
    };
    const caso = new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto",
      dataset: "dataset",
    });

    const resultado = await caso.ejecutar("flujo-2");

    expect(resultado.compatible).toBe(false);
    expect(resultado.operacionesNoSoportadas.join(" ")).toContain("ApplyMap");
    expect(resultado.sqlBigQuery).toBe("");
    expect(estimador.estimarConsulta).not.toHaveBeenCalled();
  });

  it("compila con vNext Num minúsculo y preceding LOAD como el reporte BQ_Ventas_M", async () => {
    const script =
      `
      SET DateFormat='M/D/YYYY';
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Fecha, Cantidad;
      SELECT Fecha, Cantidad FROM ` +
      "`proyecto.dataset.ventas`" +
      `;
      [Fechas]: LOAD num(Month(Fecha)) AS Mes, Cantidad RESIDENT [Base]
      WHERE Fecha >= '2026-07-01' AND Fecha < '2026-08-01';
      [Salida]: LOAD Mes, Total;
      LOAD Mes, Count(Cantidad) AS Total RESIDENT [Fechas] GROUP BY Mes;
    `;
    const qlik = { obtenerScriptApp: vi.fn(async () => ({ script })) };
    const estimador = {
      estimarConsulta: vi.fn(async () => ({
        bytesProcesados: 10,
        costoEstimadoUsd: 0,
      })),
    };
    const resultado = await new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto",
      dataset: "dataset",
    }).ejecutar("bq-ventas-m");

    expect(resultado.compatible).toBe(true);
    expect(resultado.operacionesNoSoportadas).toEqual([]);
    expect(resultado.sqlBigQuery).toContain("COUNT(`Cantidad`) AS `Total`");
    expect(resultado.sqlBigQuery).toContain("Fecha` >= '2026-07-01'");
    expect(resultado.sqlBigQuery).toContain("Fecha` < '2026-08-01'");
    expect(estimador.estimarConsulta).toHaveBeenCalledTimes(1);
  });

  it("usa metadata de tipos BigQuery al compilar funciones temporales", async () => {
    const script = `
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Fecha;
      SQL SELECT Fecha FROM \`proyecto.dataset.ventas\`;
      [Salida]: LOAD Year(Fecha) AS Anio RESIDENT [Base];
    `;
    const qlik = { obtenerScriptApp: vi.fn(async () => ({ script })) };
    const estimador = {
      obtenerEsquemaTabla: vi.fn(async () => ({ Fecha: "DATE" })),
      estimarConsulta: vi.fn(async () => ({
        bytesProcesados: 1,
        costoEstimadoUsd: 0,
      })),
    };

    const resultado = await new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto",
      dataset: "dataset",
    }).ejecutar("tipos-bq");

    expect(resultado.compatible).toBe(true);
    expect(estimador.obtenerEsquemaTabla).toHaveBeenCalledWith(
      "proyecto.dataset.ventas",
    );
    expect(resultado.sqlBigQuery).toContain(
      "EXTRACT(YEAR FROM `Fecha`) AS `Anio`",
    );
    expect(resultado.sqlBigQuery).not.toContain("EXTRACT(YEAR FROM COALESCE(");
  });

  it("devuelve el SQL compilado cuando BigQuery no puede validar el dry-run", async () => {
    const qlik = {
      obtenerScriptApp: vi.fn(async () => ({ script: SCRIPT_OK })),
    };
    const estimador = {
      estimarConsulta: vi.fn(async () => {
        throw new Error("Access Denied: Table proyecto.dataset.ventas");
      }),
    };
    const caso = new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto",
      dataset: "dataset",
    });

    const resultado = await caso.ejecutar("flujo-error-iam");

    expect(resultado.compatible).toBe(true);
    expect(resultado.sqlBigQuery).toContain("`proyecto.dataset.ventas`");
    expect(resultado.validacionBigQuery).toEqual({
      exitosa: false,
      mensajeError: "Access Denied: Table proyecto.dataset.ventas",
    });
    expect(resultado.bytesProcesados).toBe(0);
    expect(resultado.costoEstimadoUsd).toBe(0);
  });

  it("acepta una fuente totalmente calificada fuera del proyecto y dataset de staging", async () => {
    const qlik = {
      obtenerScriptApp: vi.fn(async () => ({
        script:
          "LIB CONNECT TO [Google BigQuery:Produccion]; [x]: LOAD [id]; SQL SELECT id FROM `otro.otro_dataset.t`;",
      })),
    };
    const estimador = {
      estimarConsulta: vi.fn(async () => ({
        bytesProcesados: 1,
        costoEstimadoUsd: 0,
      })),
    };
    const caso = new PreflightDataflow(qlik, estimador, {
      projectId: "proyecto-staging",
      dataset: "dataset_staging",
    });

    const resultado = await caso.ejecutar("flujo-3");
    expect(resultado.compatible).toBe(true);
    expect(resultado.operacionesNoSoportadas).toEqual([]);
    expect(resultado.sqlBigQuery).toContain("`otro.otro_dataset.t`");
    expect(estimador.estimarConsulta).toHaveBeenCalledTimes(1);
  });
});

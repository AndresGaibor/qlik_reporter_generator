import { describe, expect, it } from "bun:test";
import { parsearDataflow } from "./parser-dataflow.js";

const fixture = new URL(
  "../fixtures/dataflow-bigquery-basico.qlik",
  import.meta.url,
);

describe("parsearDataflow", () => {
  it("extrae fuentes BigQuery, filtros, aliases y salida", async () => {
    const plan = parsearDataflow(await Bun.file(fixture).text());

    expect(plan.fuentes).toHaveLength(2);
    expect(plan.fuentes[0]).toMatchObject({
      tipo: "bigquery",
      tabla: "demo-proyecto.EDWH_REP.VENTAS_COMERCIAL_DIARIAS_D",
    });
    expect(plan.pasos.map((paso) => paso.tipo)).toContain("filtrar");
    expect(plan.pasos.map((paso) => paso.tipo)).toContain("join");
    expect(plan.salida.tablaLogica).toBe("ventas_filtradas");
    expect(plan.salida.campos).toContain("Tienda");
    expect(plan.operacionesNoSoportadas).toEqual([]);
  });

  it("representa RESIDENT y LEFT JOIN con sus tablas", async () => {
    const plan = parsearDataflow(await Bun.file(fixture).text());
    const filtroResident = plan.pasos.find(
      (paso) => paso.tipo === "filtrar" && paso.dialecto === "qlik",
    );
    const join = plan.pasos.find((paso) => paso.tipo === "join");

    expect(filtroResident).toMatchObject({ entrada: "ventas" });
    expect(join).toMatchObject({
      tipo: "join",
      join: "left",
      izquierda: "ventas_filtradas",
    });
    if (join?.tipo === "join") expect(join.claves).toContain("TiendaId");
  });

  it("no ignora funciones Qlik desconocidas", () => {
    const plan = parsearDataflow(`
      LIB CONNECT TO [Google BigQuery:BigQuery_Produccion];
      [salida]:
      LOAD FuncionInventada([TiendaId]) AS [Tienda];
      SQL SELECT TiendaId FROM \`demo-proyecto.ds.tabla\`;
    `);

    expect(plan.operacionesNoSoportadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operacion: "FuncionInventada" }),
      ]),
    );
  });
  it("usa como salida la tabla almacenada antes del DROP en el Dataflow real", async () => {
    const real = new URL(
      "../fixtures/dataflow-bigquery-filtro-fecha-real.qlik",
      import.meta.url,
    );
    const plan = parsearDataflow(await Bun.file(real).text());

    expect(plan.operacionesNoSoportadas).toEqual([]);
    expect(plan.salida).toEqual({
      tablaLogica: "Filtro 1_DEFAULT",
      campos: ["Fecha", "Venta_Neta_USD"],
    });
    expect(plan.pasos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "filtrar",
          dialecto: "qlik",
          condicion: "[Fecha] = '6/1/2026'",
        }),
      ]),
    );
  });

  it("acepta num case-insensitive y compone preceding LOAD sobre RESIDENT", () => {
    const plan = parsearDataflow(`
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Fecha, Cantidad;
      SELECT Fecha, Cantidad FROM ` + "`p.d.ventas`" + `;
      [Fechas]: LOAD num(Month(Fecha)) AS Mes, Cantidad RESIDENT [Base];
      [Salida]: LOAD Mes, Total;
      LOAD Mes, Count(Cantidad) AS Total RESIDENT [Fechas] GROUP BY Mes;
      STORE [Salida] INTO [lib://x/out.csv] (txt);
      DROP TABLE [Salida];
    `);

    expect(plan.operacionesNoSoportadas).toEqual([]);
    expect(plan.salida.tablaLogica).toBe("Salida");
    expect(plan.salida.campos).toEqual(["Mes", "Total"]);
  });

  it("marca incompatible un wildcard mezclado con campos calculados", () => {
    const plan = parsearDataflow(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [salida]: LOAD *, Upper([categoria]) AS [Categoria];
      SQL SELECT * FROM \`p.d.t\`;
    `);

    expect(plan.operacionesNoSoportadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operacion: "WildcardMixto" }),
      ]),
    );
  });
});

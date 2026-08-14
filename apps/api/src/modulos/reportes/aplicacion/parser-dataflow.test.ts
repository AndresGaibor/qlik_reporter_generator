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
    expect(join).toMatchObject({ tipo: "join", join: "left", izquierda: "ventas_filtradas" });
    if (join?.tipo === "join") expect(join.claves).toContain("TiendaId");
  });

  it("no ignora funciones Qlik desconocidas", () => {
    const plan = parsearDataflow(`
      LIB CONNECT TO [Google BigQuery:BigQuery_Produccion];
      [salida]:
      LOAD ApplyMap('mapa', [TiendaId]) AS [Tienda];
      SQL SELECT TiendaId FROM \`demo-proyecto.ds.tabla\`;
    `);

    expect(plan.operacionesNoSoportadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operacion: "ApplyMap" }),
      ]),
    );
  });
});

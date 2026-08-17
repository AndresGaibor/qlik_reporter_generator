import { describe, expect, it } from "bun:test";
import type { PlanDataflow } from "../dominio/plan-dataflow.js";
import { parsearDataflow } from "./parser-dataflow.js";
import { compilarPlanABigQuery } from "./compilador-bigquery.js";

const fixture = new URL("../fixtures/dataflow-bigquery-basico.qlik", import.meta.url);

describe("compilarPlanABigQuery", () => {
  it("compila el fixture a CTEs BigQuery con filtro, función y LEFT JOIN", async () => {
    const plan = parsearDataflow(await Bun.file(fixture).text());
    const { sql, camposSalida } = compilarPlanABigQuery(plan);

    expect(sql).toContain("WITH");
    expect(sql).toContain("`demo-proyecto.EDWH_REP.VENTAS_COMERCIAL_DIARIAS_D`");
    expect(sql).toContain("WHERE Fecha >= DATE('2026-06-01')");
    expect(sql).toContain("UPPER(`Categoria`)");
    expect(sql).toContain("LEFT JOIN");
    expect(sql).toContain("`TiendaId`");
    expect(camposSalida).toContain("Tienda");
  });

  it("traduce expresiones, DISTINCT, agregación, GROUP BY y ORDER BY", () => {
    const plan: PlanDataflow = {
      fuentes: [{
        id: "fuente",
        tipo: "bigquery",
        tabla: "proyecto.dataset.ventas",
        campos: ["categoria", "monto", "fecha"].map((alias) => ({ expresion: alias, alias, dialecto: "bigquery" as const })),
      }],
      pasos: [
        {
          tipo: "filtrar",
          entrada: "fuente",
          salida: "filtrada",
          condicion: "[monto] <> 0 AND [categoria] IN ('A', 'B') AND [fecha] IS NOT NULL",
          dialecto: "qlik",
        },
        {
          tipo: "proyectar",
          entrada: "filtrada",
          salida: "resumen",
          distinct: true,
          dialecto: "qlik",
          campos: [
            { expresion: "Upper([categoria])", alias: "Categoria", dialecto: "qlik" },
            { expresion: "If(Sum([monto]) > 100, 'ALTO', 'BAJO')", alias: "Nivel", dialecto: "qlik" },
            { expresion: "Sum([monto])", alias: "Total", dialecto: "qlik" },
            { expresion: "Year([fecha])", alias: "Anio", dialecto: "qlik" },
          ],
          agrupacion: ["[categoria]", "Year([fecha])"],
        },
        {
          tipo: "ordenar",
          entrada: "resumen",
          salida: "resumen_ordenado",
          campos: [{ expresion: "[Total]", direccion: "desc", dialecto: "qlik" }],
        },
      ],
      salida: { tablaLogica: "resumen_ordenado", campos: ["Categoria", "Nivel", "Total", "Anio"] },
      operacionesNoSoportadas: [],
    };

    const { sql } = compilarPlanABigQuery(plan);
    expect(sql).toContain("SELECT DISTINCT");
    expect(sql).toContain("CASE WHEN SUM(`monto`) > 100 THEN 'ALTO' ELSE 'BAJO' END");
    expect(sql).toContain("EXTRACT(YEAR FROM `fecha`)");
    expect(sql).toContain("GROUP BY `categoria`, EXTRACT(YEAR FROM `fecha`)");
    expect(sql).toContain("ORDER BY `Total` DESC");
    expect(sql).toContain("`monto` != 0");
  });

  it.each(["inner", "left", "right", "full"] as const)("compila join %s", (tipo) => {
    const plan: PlanDataflow = {
      fuentes: [
        { id: "a", tipo: "bigquery", tabla: "p.d.a", campos: [{ expresion: "id", alias: "id", dialecto: "bigquery" }, { expresion: "valor", alias: "valor", dialecto: "bigquery" }] },
        { id: "b", tipo: "bigquery", tabla: "p.d.b", campos: [{ expresion: "id", alias: "id", dialecto: "bigquery" }, { expresion: "nombre", alias: "nombre", dialecto: "bigquery" }] },
      ],
      pasos: [{ tipo: "join", join: tipo, izquierda: "a", derecha: "b", salida: "salida", claves: ["id"] }],
      salida: { tablaLogica: "salida", campos: ["id", "valor", "nombre"] },
      operacionesNoSoportadas: [],
    };
    expect(compilarPlanABigQuery(plan).sql).toContain(`${tipo.toUpperCase()} JOIN`);
  });

  it("rechaza operaciones no soportadas antes de generar SQL", () => {
    const plan: PlanDataflow = {
      fuentes: [],
      pasos: [],
      salida: { tablaLogica: "salida", campos: [] },
      operacionesNoSoportadas: [{ operacion: "ApplyMap", detalle: "no soportada" }],
    };
    expect(() => compilarPlanABigQuery(plan)).toThrow("ApplyMap");
  });
});

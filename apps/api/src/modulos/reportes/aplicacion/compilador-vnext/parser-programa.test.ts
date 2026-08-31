import { describe, expect, it } from "bun:test";
import { parsearProgramaQlik } from "./parser-programa.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function parseFixture(name: string) {
  return parsearProgramaQlik(await Bun.file(corpus(name)).text());
}

describe("parsearProgramaQlik", () => {
  it("reconoce SELECT BigQuery generado por Qlik aunque no lleve prefijo SQL", () => {
    const program = parsearProgramaQlik(
      `
      LIB CONNECT TO [Bancolombia prueba:Google_BigQuery_lafavorita-182519];
      [Ventas]: LOAD [Fecha], [Cantidad];
      SELECT Fecha, Cantidad FROM ` +
        "`lafavorita-182519`.`EDWH_REP`.`VENTAS_MENSUALES_A`" +
        `;
    `,
    );

    expect(program.statements.map((item) => item.type)).toEqual([
      "connect",
      "load",
      "native_sql",
    ]);
    const sql = program.statements[2];
    expect(sql?.type).toBe("native_sql");
    if (!sql || sql.type !== "native_sql")
      throw new Error("native_sql esperado");
    expect(sql.sql.text).toBe(
      "SELECT Fecha, Cantidad FROM `lafavorita-182519`.`EDWH_REP`.`VENTAS_MENSUALES_A`",
    );
  });

  it("preserva GoogleSQL nativo con múltiples JOIN y ON compuesto", async () => {
    const program = await parseFixture("sql-native-multi-join.qlik");
    expect(program.statements.map((item) => item.type)).toEqual([
      "connect",
      "load",
      "native_sql",
    ]);
    const sql = program.statements[2];
    expect(sql?.type).toBe("native_sql");
    if (sql?.type !== "native_sql") throw new Error("native_sql esperado");
    expect(sql.sql.text).toBe(
      "SELECT a.id, b.nombre, c.zona\n" +
        "FROM `p.d.a` a\n" +
        "LEFT JOIN `p.d.b` b ON a.id = b.id\n" +
        "INNER JOIN `p.d.c` c ON a.zona_id = c.id AND c.activo = TRUE",
    );
  });

  it.each([
    ["sql-native-cte-subquery.qlik", ["WITH", "SELECT", "FROM"]],
    ["sql-native-having.qlik", ["GROUP BY", "HAVING"]],
    ["sql-native-qualify-window.qlik", ["OVER", "QUALIFY"]],
    ["sql-native-union.qlik", ["UNION"]],
    ["sql-native-pivot.qlik", ["PIVOT"]],
    ["sql-native-unpivot.qlik", ["UNPIVOT"]],
  ])("no descompone ni pierde cláusulas de %s", async (name, fragments) => {
    const program = await parseFixture(name);
    const sql = program.statements.find((item) => item.type === "native_sql");
    expect(sql?.type).toBe("native_sql");
    if (!sql || sql.type !== "native_sql")
      throw new Error("native_sql esperado");
    for (const fragment of fragments)
      expect(sql.sql.text.toUpperCase()).toContain(fragment);
  });

  it("acepta comentario generado por Qlik entre INNER JOIN y LOAD", () => {
    const program = parsearProgramaQlik(`
      [Base]: LOAD [Fecha];
      SELECT Fecha FROM \`p.d.base\`;
      INNER JOIN([Base])
        // [DIM_FECHA]:
        LOAD [ID_FECHA], [NOM_FEC] AS [Fecha], [NOM_MES];
      SELECT ID_FECHA, NOM_FEC, NOM_MES FROM \`p.d.dim_fecha\`;
    `);

    const joinLoad = program.statements[2];
    expect(joinLoad).toMatchObject({
      type: "load",
      prefix: { type: "join", join: "inner", target: "Base" },
    });
    expect(joinLoad?.type === "load" ? joinLoad.body : "").toContain(
      "[NOM_FEC] AS [Fecha]",
    );
  });

  it("conserva el label y reconoce LOAD wildcard", async () => {
    const program = await parseFixture("regression-ventas-mensuales-join.qlik");
    const load = program.statements[1];
    expect(load).toMatchObject({
      type: "load",
      label: "Salida",
      body: "*",
      wildcard: true,
    });
  });

  it("preserva If() como expresión dentro de LOAD multilinea con AS", () => {
    const script = `[Calcular campos 1]:\nNOCONCATENATE\nLOAD\n  [ID_LOCAL],\n  If(\n    ([NOM_TIPO_UOP] <> 'SUBLUGAR DE TRABAJO'\n     and [NOM_TIPO_UOP] <> 'DEPARTAMENTO'\n     and [NOM_TIPO_UOP] <> 'INDUSTRIAS')\n    or [ID_LOCAL] = 0,\n    1,\n    0\n  ) AS [FILTRO_UOP];\nSELECT ID_LOCAL, NOM_TIPO_UOP FROM \`p.d.uop\`;`;
    const program = parsearProgramaQlik(script);
    expect(program.statements.map((item) => item.type)).toEqual([
      "load",
      "native_sql",
    ]);
    const load = program.statements[0];
    expect(load?.type).toBe("load");
    if (load?.type !== "load") throw new Error("load esperado");
    expect(load.body).toContain("If(");
    expect(load.body).toContain("AS [FILTRO_UOP]");
  });
});

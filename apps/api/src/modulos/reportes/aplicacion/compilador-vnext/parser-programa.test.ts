import { describe, expect, it } from "bun:test";
import { parsearProgramaQlik } from "./parser-programa.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function parseFixture(name: string) {
  return parsearProgramaQlik(await Bun.file(corpus(name)).text());
}

describe("parsearProgramaQlik", () => {
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
});

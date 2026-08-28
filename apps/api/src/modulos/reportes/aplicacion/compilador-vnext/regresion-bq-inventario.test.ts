import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const fixture = new URL(
  "../../fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik",
  import.meta.url,
);

describe("regresión BQ_Inventario", () => {
  it("preserva If() como expresión y normaliza OUTER JOIN", async () => {
    const script = await Bun.file(fixture).text();
    const program = parsearProgramaQlik(script);
    const filtro = program.statements.find(
      (item) => item.type === "load" && item.body.includes("FILTRO_UOP"),
    );
    expect(filtro?.type).toBe("load");
    expect(filtro?.type === "load" ? filtro.body : "").toContain("If(");

    const outer = program.statements.find(
      (item) =>
        item.type === "load" &&
        item.prefix.type === "join" &&
        item.prefix.target === "Unir 5",
    );
    expect(outer?.type).toBe("load");
    if (outer?.type !== "load") throw new Error("OUTER JOIN esperado");
    expect(outer.prefix).toEqual({
      type: "join",
      join: "full",
      target: "Unir 5",
    });

    const result = compilarDataflowVNext(script);
    expect(result.sql).toContain("CASE WHEN");
    expect(result.sql).toContain("FULL JOIN");
    expect(result.sql).toContain("TIENE VENTAS ULTIMOS 5 DÍAS");
    expect(result.sql).not.toContain("If(");

    const sqlNormalizado = result.sql.replace(/\s+/g, " ").trim();
    expect(sqlNormalizado).toContain("FULL JOIN");
    expect(sqlNormalizado).not.toContain("INNER JOIN");
    expect(sqlNormalizado).not.toContain("LEFT JOIN");
    expect(sqlNormalizado).not.toContain("DISTINCT");
    expect(sqlNormalizado).not.toMatch(/GROUP BY|ARRAY_AGG|QUALIFY/);

    const joinSql = sqlNormalizado.slice(sqlNormalizado.indexOf("FULL JOIN"));
    expect(joinSql).toContain("ON l.`ID_UOP` = r.`ID_UOP`");
    expect(joinSql).not.toContain(" AND ");
    expect(joinSql).not.toContain("ON l.`ID_UOP` = r.`ID_UOP` AND");
  });
});

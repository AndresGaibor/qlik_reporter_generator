import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function compile(name: string) {
  return compilarDataflowVNext(await Bun.file(corpus(name)).text());
}

describe("emisión BigQuery vNext fase 1", () => {
  it("preserva profesionalmente la regresión de ventas sin CTEs artificiales", async () => {
    const result = await compile("regression-ventas-mensuales-join.qlik");

    expect(result.strategy).toBe("source_sql_passthrough");
    expect(result.sql).toStartWith("SELECT\n  'Ventas' AS Tipo");
    expect(result.sql).toContain(
      "INNER JOIN `EDWH.DIM_FECHA` AS F ON Fecha = NOM_FEC",
    );
    expect(result.sql).toContain(
      "WHERE DATE_TRUNC(Fecha, MONTH) = DATE '2026-07-01'",
    );
    expect(result.sql).toEndWith("GROUP BY ALL");
    expect(result.sql).not.toMatch(/\b(?:fuente|filtro|proyeccion)_\d+\b/i);
    expect(result.sql.match(/\bINNER JOIN\b/gi)).toHaveLength(1);
  });

  it.each([
    ["sql-native-cte-subquery.qlik", "WITH base AS"],
    ["sql-native-having.qlik", "HAVING"],
    ["sql-native-qualify-window.qlik", "QUALIFY"],
    ["sql-native-union.qlik", "UNION"],
    ["sql-native-pivot.qlik", "PIVOT"],
    ["sql-native-unpivot.qlik", "UNPIVOT"],
    ["sql-native-comments-semicolons.qlik", "'a;b' AS texto"],
  ])(
    "mantiene intacta la característica nativa de %s",
    async (fixture, fragment) => {
      const result = await compile(fixture);
      expect(result.sql.toUpperCase()).toContain(fragment.toUpperCase());
      expect(result.sql).not.toContain("fuente_1");
    },
  );

  it("conserva exactamente un multi-JOIN con ON compuesto", async () => {
    const result = await compile("sql-native-multi-join.qlik");
    expect(result.sql).toBe(
      "SELECT a.id, b.nombre, c.zona\n" +
        "FROM `p.d.a` a\n" +
        "LEFT JOIN `p.d.b` b ON a.id = b.id\n" +
        "INNER JOIN `p.d.c` c ON a.zona_id = c.id AND c.activo = TRUE",
    );
  });
  it("emite filtros simples como SQL profesional sin CASE artificial", async () => {
    const result = await compile("qlik-filter-project.qlik");
    expect(result.sql).toContain("FROM `p.d.ventas`");
    expect(result.sql).not.toContain("FROM (\n  SELECT id, categoria, monto");
    expect(result.sql).toContain("WHERE `monto` > 0");
    expect(result.sql).not.toContain("WHERE CASE WHEN");
    expect(result.sql).not.toContain("WITH fuente_");
    expect(result.sql).not.toContain("`id` AS `id`");
  });

  it("solo expande la semántica NULL cuando <> realmente lo necesita", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id WHERE estado <> Null();
      SQL SELECT id, estado FROM \`p.d.t\`;
    `);
    expect(result.sql).toContain("(`estado` IS NULL) != (NULL IS NULL) OR `estado` != NULL");
    expect(result.sql).not.toContain("WHERE CASE WHEN");
  });

  it("no aplana una fuente SQL compleja solo para hacerla más bonita", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, nombre;
      SQL SELECT a.id, b.nombre
      FROM \`p.d.a\` a
      INNER JOIN \`p.d.b\` b ON a.id = b.id;
    `);
    expect(result.sql).toContain("FROM (\n  SELECT a.id, b.nombre");
    expect(result.sql).toContain("INNER JOIN `p.d.b` b ON a.id = b.id");
  });

  it("expande SET dentro de GoogleSQL sin dejar infraestructura Qlik", async () => {
    const result = await compile("qlik-set-let-expansion.qlik");
    expect(result.sql).toContain("DATE '2026-01-01'");
    expect(result.sql).not.toContain("$(");
  });

  it("expande SET y LET constantes antes de parsear expresiones LOAD", () => {
    const result = compilarDataflowVNext(`
      SET vFactor=1.2;
      LET vMultiplicador=3*7;
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, monto * $(vFactor) * $(vMultiplicador) AS total;
      SQL SELECT id, monto FROM \`p.d.t\`;
    `);
    expect(result.sql).toContain("`monto` * 1.2 * 21 AS `total`");
    expect(result.sql).not.toContain("$(");
  });

  it("expande una variable inexistente como texto vacío según Qlik", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      SQL SELECT 'a$(NoExiste)b' AS texto;
    `);
    expect(result.sql).toContain("SELECT 'ab' AS texto");
  });

});

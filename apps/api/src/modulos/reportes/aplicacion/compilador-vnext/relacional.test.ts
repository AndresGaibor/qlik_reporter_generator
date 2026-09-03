import { describe, expect, it } from "bun:test";
import { analizarProgramaQlik } from "./analizador-semantico.js";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function script(name: string) {
  return Bun.file(corpus(name)).text();
}

async function compile(name: string) {
  return compilarDataflowVNext(await script(name));
}

describe("relacional vNext", () => {
  it("mantiene plana la proyección y el WHERE Qlik sobre SQL nativo simple", async () => {
    const result = await compile("qlik-filter-project.qlik");
    expect(result.sql).toBe(
      "SELECT\n" +
        "  `id`,\n" +
        "  UPPER(`categoria`) AS `Categoria`,\n" +
        "  `monto`\n" +
        "FROM `p.d.ventas`\n" +
        "WHERE `monto` > 0",
    );
  });

  it("preserva filtro y agregación en cadena RESIDENT", async () => {
    const result = await compile("qlik-resident-chain.qlik");
    expect(result.sql).toContain("SUM(`monto`) AS `Total`");
    expect(result.sql).toContain("GROUP BY ALL");
    expect(result.sql).toContain("`monto` > 0");
  });

  it.each(["inner", "left", "right", "full"] as const)(
    "compila %s JOIN Qlik con natural keys explícitas",
    async (kind) => {
      const result = await compile(`qlik-${kind}-join.qlik`);
      expect(result.sql).toContain(`${kind.toUpperCase()} JOIN`);
      expect(result.sql).toContain("l.`id` = r.`id`");
      expect(result.sql).toContain("`nombre`");
    },
  );

  it("normaliza OUTER JOIN de Qlik a FULL JOIN BigQuery", async () => {
    const result = await compile("qlik-outer-join.qlik");
    expect(result.sql).toContain("FULL JOIN");
    expect(result.sql).toContain("l.`id` = r.`id`");
    expect(result.sql).not.toContain("OUTER JOIN");
  });

  it("compila Concatenate como UNION ALL sin deduplicar", async () => {
    const result = await compile("qlik-concatenate.qlik");
    expect(result.sql).toContain("UNION ALL");
    expect(result.sql).not.toMatch(/\bUNION\b(?!\s+ALL)/);
  });

  it("NoConcatenate mantiene símbolos separados aunque compartan relación", async () => {
    const plan = analizarProgramaQlik(
      parsearProgramaQlik(await script("qlik-noconcatenate.qlik")),
    );
    expect(plan.tables.A).toBeDefined();
    expect(plan.tables.B).toBeDefined();
    expect(plan.tables.A).not.toBe(plan.tables.B);
  });

  it("fork crea dos ramas independientes con sus filtros", async () => {
    const plan = analizarProgramaQlik(
      parsearProgramaQlik(await script("qlik-fork-branches.qlik")),
    );
    expect(plan.tables.A).toBeDefined();
    expect(plan.tables.B).toBeDefined();
    expect(plan.tables.A).not.toBe(plan.tables.B);
    const relationA = plan.relations.find((r) => r.id === plan.tables.A);
    const relationB = plan.relations.find((r) => r.id === plan.tables.B);
    expect(relationA?.op).toBe("filter");
    expect(relationB?.op).toBe("filter");
  });

  it.each(["inner", "left", "right"] as const)(
    "modela %s KEEP sin fusionar las dos tablas",
    async (kind) => {
      const plan = analizarProgramaQlik(
        parsearProgramaQlik(await script(`qlik-${kind}-keep.qlik`)),
      );
      expect(plan.tables.A).toBeDefined();
      expect(plan.tables.B).toBeDefined();
      expect(plan.tables.A).not.toBe(plan.tables.B);
      expect(plan.relations.some((r) => r.op === "semi_filter")).toBe(true);
    },
  );

  it("Crosstable se baja a UNPIVOT con qualifiers", async () => {
    const result = await compile("qlik-crosstable.qlik");
    expect(result.sql).toContain("UNPIVOT INCLUDE NULLS");
    expect(result.sql).toContain("`Venta` FOR `Mes` IN (`ene`, `feb`, `mar`)");
    expect(result.sql).toContain("producto");
  });

  it("First limita las filas leídas de la fuente", async () => {
    const result = await compile("qlik-first-sample.qlik");
    expect(result.sql).toContain("LIMIT 10");
    expect(result.sql).toContain("ORDER BY id");
  });

  it("compone preceding LOAD sobre un LOAD RESIDENT en orden interno a externo", () => {
    const result = compilarDataflowVNext(
      `
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD id, monto;
      SELECT id, monto FROM ` +
        "`p.d.ventas`" +
        `;

      [Salida]:
      NOCONCATENATE
      LOAD id, Total;
      LOAD id, Sum(monto) AS Total
      RESIDENT [Base]
      GROUP BY id;
    `,
    );

    expect(result.sql).toContain("SUM(`monto`) AS `Total`");
    expect(result.sql).toContain("`Total`");
    expect(result.diagnostics).toEqual([]);
  });

  it("preserva el componente numérico de un dual Num(Month()) reutilizado por RESIDENT", () => {
    const result = compilarDataflowVNext(
      `
      SET DateFormat='M/D/YYYY';
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Fecha, id;
      SELECT Fecha, id FROM ` +
        "`p.d.ventas`" +
        `;
      [Fechas]: LOAD Num(Month(Fecha)) AS Mes, id RESIDENT [Base];
      [Salida]: LOAD Mes, Count(id) AS Total RESIDENT [Fechas] GROUP BY Mes;
    `,
    );

    expect(result.sql).toContain("COUNT(`id`) AS `Total`");
    expect(result.sql).toContain("GROUP BY");
    expect(result.diagnostics).toEqual([]);
  });

  it("preserva un dual Num(Month()) a través de GROUP BY y preceding LOAD", () => {
    const result = compilarDataflowVNext(
      `
      SET DateFormat='M/D/YYYY';
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Fecha, id;
      SELECT Fecha, id FROM ` +
        "`p.d.ventas`" +
        `;
      [Fechas]: LOAD Num(Month(Fecha)) AS Mes, id RESIDENT [Base];
      [Salida]: LOAD Mes AS MesFinal, Total;
      LOAD Mes, Count(id) AS Total RESIDENT [Fechas] GROUP BY Mes;
    `,
    );

    expect(result.sql).toContain("COUNT(`id`) AS `Total`");
    expect(result.sql).toContain("AS `MesFinal`");
    expect(result.sql).not.toContain(
      "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("preserva un dual a través de CONCATENATE antes de un RESIDENT agregado", () => {
    const result = compilarDataflowVNext(
      `
      SET DateFormat='M/D/YYYY';
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Fechas]: LOAD Num(Month(Fecha)) AS Mes, id;
      SQL SELECT Fecha, id FROM ` +
        "`p.d.ventas_2025`" +
        `;
      CONCATENATE ([Fechas]) LOAD Num(Month(Fecha)) AS Mes, id;
      SQL SELECT Fecha, id FROM ` +
        "`p.d.ventas_2026`" +
        `;
      [Salida]: LOAD Mes, Count(id) AS Total RESIDENT [Fechas] GROUP BY Mes;
    `,
    );

    expect(result.sql).toContain("UNION ALL");
    expect(result.sql).toContain("COUNT(`id`) AS `Total`");
    expect(result.sql).toContain("__qlik_dual_Mes__numeric");
    expect(result.diagnostics).toEqual([]);
  });

  it("rellena con NULL los componentes duales cuando una rama CONCATENATE no tiene el campo", () => {
    const result = compilarDataflowVNext(
      `
      SET DateFormat='M/D/YYYY';
      SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
      LIB CONNECT TO [Google BigQuery:Prod];
      [Fechas]: LOAD Num(Month(Fecha)) AS Mes, id;
      SQL SELECT Fecha, id FROM ` +
        "`p.d.ventas_2025`" +
        `;
      CONCATENATE ([Fechas]) LOAD id;
      SQL SELECT id FROM ` +
        "`p.d.ventas_2026`" +
        `;
      [Salida]: LOAD Mes, Count(id) AS Total RESIDENT [Fechas] GROUP BY Mes;
    `,
    );

    expect(result.sql).toContain("NULL AS `__qlik_dual_Mes__numeric`");
    expect(result.sql).toContain("COUNT(`id`) AS `Total`");
    expect(result.diagnostics).toEqual([]);
  });

  it("rechaza reutilizar un campo mezclado dual/no-dual después de CONCATENATE", () => {
    const compileMixed = () =>
      compilarDataflowVNext(
        `
        SET DateFormat='M/D/YYYY';
        SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
        LIB CONNECT TO [Google BigQuery:Prod];
        [Fechas]: LOAD Num(Month(Fecha)) AS Mes, id;
        SQL SELECT Fecha, id FROM ` +
          "`p.d.ventas_2025`" +
          `;
        CONCATENATE ([Fechas]) LOAD categoria AS Mes, id;
        SQL SELECT categoria, id FROM ` +
          "`p.d.ventas_2026`" +
          `;
        [Salida]: LOAD Mes, Count(id) AS Total RESIDENT [Fechas] GROUP BY Mes;
      `,
      );

    try {
      compileMixed();
      throw new Error("debió rechazar el dual mezclado");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
      );
    }
  });

  it("Generic queda explícitamente no exportable a una sola relación", async () => {
    try {
      await compile("qlik-generic-load.qlik");
      throw new Error("debió fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "BIGQUERY_GENERIC_MULTI_RELATION",
      );
    }
  });
});

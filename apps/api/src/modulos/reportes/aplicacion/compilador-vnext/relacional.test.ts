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
  it("fusiona WHERE + proyección Qlik alrededor de SQL nativo lossless", async () => {
    const result = await compile("qlik-filter-project.qlik");
    expect(result.sql).toContain("UPPER(`categoria`) AS `Categoria`");
    expect(result.sql).toContain("`monto` > 0");
    expect(result.sql).toContain(
      "FROM (\n  SELECT id, categoria, monto FROM `p.d.ventas`\n) AS src",
    );
  });

  it("preserva filtro y agregación en cadena RESIDENT", async () => {
    const result = await compile("qlik-resident-chain.qlik");
    expect(result.sql).toContain("SUM(`monto`) AS `Total`");
    expect(result.sql).toContain("GROUP BY `categoria`");
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

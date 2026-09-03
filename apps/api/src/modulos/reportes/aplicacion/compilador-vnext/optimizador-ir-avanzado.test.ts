import { describe, expect, it } from "bun:test";
import type { PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import { optimizarPlanRelacionalVNext } from "./optimizador-ir.js";

const span = { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
const base = { schemaKnown: true, span };

function source(id = "s"): Extract<RelacionVNext, { op: "native_sql" }> {
  return {
    ...base,
    id,
    op: "native_sql",
    fields: ["Fecha", "monto", "categoria"],
    sql: "SELECT Fecha, monto, categoria FROM `p.d.ventas`",
    connection: "Google BigQuery:Prod",
  };
}

function plan(
  relations: RelacionVNext[],
  outputRelationId: string,
): PlanCompilacionVNext {
  return {
    relations,
    effects: [],
    tables: { Salida: outputRelationId },
    mappings: {},
    outputRelationId,
    diagnostics: [],
  };
}

function project(
  input = "s",
  id = "p",
): Extract<RelacionVNext, { op: "project" }> {
  return {
    ...base,
    id,
    op: "project",
    input,
    fields: ["Fecha", "Anio", "monto"],
    projections: [
      { expression: "Fecha", alias: "Fecha" },
      { expression: "Year(Fecha)", alias: "Anio" },
      { expression: "monto", alias: "monto" },
    ],
  };
}

function filter(
  input: string,
  condition: string,
  id = "f",
): Extract<RelacionVNext, { op: "filter" }> {
  return {
    ...base,
    id,
    op: "filter",
    input,
    condition,
    fields: input === "s" ? source().fields : ["Fecha", "Anio", "monto"],
  };
}

describe("pushdown seguro de filtros en JOIN", () => {
  const joinSource = (id: string, fields: string[]): RelacionVNext => ({
    ...base,
    id,
    op: "native_sql",
    fields,
    sql: `SELECT ${fields.join(", ")} FROM \`p.d.${id}\``,
    connection: "Google BigQuery:Prod",
  });
  const join = (
    kind: "inner" | "left" | "right" | "full" = "inner",
  ): RelacionVNext => ({
    ...base,
    id: "j",
    op: "join",
    left: "l",
    right: "r",
    join: kind,
    keys: ["id"],
    fields: ["id", "left_value", "right_value", "shared"],
  });
  const joinPlan = (
    condition: string,
    kind: "inner" | "left" | "right" | "full" = "inner",
  ) =>
    plan(
      [
        joinSource("l", ["id", "left_value", "shared"]),
        joinSource("r", ["id", "right_value", "shared"]),
        join(kind),
        {
          ...filter("j", condition),
          fields: ["id", "left_value", "right_value", "shared"],
        },
      ],
      "f",
    );

  it("empuja a izquierda un predicado INNER que solo referencia izquierda", () => {
    const optimized = optimizarPlanRelacionalVNext(joinPlan("left_value > 0"));
    const output = optimized.relations.find((relation) => relation.id === "f");
    expect(output?.op).toBe("join");
    if (output?.op !== "join") throw new Error("join esperado");
    expect(output.right).toBe("r");
    const pushed = optimized.relations.find(
      (relation) => relation.id === output.left,
    );
    expect(pushed).toMatchObject({
      op: "filter",
      input: "l",
      condition: "left_value > 0",
    });
  });

  it("empuja a derecha un predicado INNER que solo referencia derecha", () => {
    const optimized = optimizarPlanRelacionalVNext(joinPlan("right_value > 0"));
    const output = optimized.relations.find((relation) => relation.id === "f");
    expect(output?.op).toBe("join");
    if (output?.op !== "join") throw new Error("join esperado");
    expect(output.left).toBe("l");
    const pushed = optimized.relations.find(
      (relation) => relation.id === output.right,
    );
    expect(pushed).toMatchObject({
      op: "filter",
      input: "r",
      condition: "right_value > 0",
    });
  });

  it("conserva encima del INNER un predicado que cruza ambas ramas", () => {
    const optimized = optimizarPlanRelacionalVNext(
      joinPlan("left_value > right_value"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "j",
    });
  });

  it("no empuja un predicado INNER que contiene Rand()", () => {
    const optimized = optimizarPlanRelacionalVNext(
      joinPlan("left_value > 0 and Rand() > 0.5"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "j",
    });
  });

  it("considera ambiguo un campo presente en ambas ramas", () => {
    const optimized = optimizarPlanRelacionalVNext(joinPlan("shared = 'X'"));
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "j",
    });
  });

  it.each(["left", "right", "full"] as const)(
    "mantiene el filtro exterior por defecto para %s JOIN",
    (kind) => {
      const optimized = optimizarPlanRelacionalVNext(
        joinPlan("left_value > 0", kind),
      );
      expect(
        optimized.relations.find((relation) => relation.id === "f"),
      ).toMatchObject({
        op: "filter",
        input: "j",
      });
    },
  );
});

describe("barreras de cardinalidad, agregación y orden", () => {
  const aggregate = (input = "s", id = "a"): RelacionVNext => ({
    ...base,
    id,
    op: "aggregate",
    input,
    fields: ["categoria", "Total"],
    projections: [
      { expression: "categoria", alias: "categoria" },
      { expression: "Sum(monto)", alias: "Total" },
    ],
    groupBy: ["categoria"],
  });
  const sort = (input = "s", id = "sort"): RelacionVNext => ({
    ...base,
    id,
    op: "sort",
    input,
    fields: [...source().fields],
    orderBy: [{ expression: "Fecha", direction: "asc" }],
  });

  it("no empuja un filtro de resultado a través de aggregate", () => {
    const output = {
      ...filter("a", "Total > 10"),
      fields: ["categoria", "Total"],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), aggregate(), output], "f"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "a",
    });
  });

  it("no empuja un filtro posterior a LIMIT/FIRST", () => {
    const limit: RelacionVNext = {
      ...base,
      id: "l",
      op: "limit",
      input: "s",
      fields: [...source().fields],
      limitExpression: "10",
    };
    const output = {
      ...filter("l", "monto > 0"),
      fields: [...source().fields],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), limit, output], "f"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({ op: "filter", input: "l" });
  });

  it("preserva sort cuando alimenta directamente a LIMIT", () => {
    const ordering = sort();
    const limit: RelacionVNext = {
      ...base,
      id: "l",
      op: "limit",
      input: "sort",
      fields: [...source().fields],
      limitExpression: "10",
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), ordering, limit], "l"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "sort")?.op,
    ).toBe("sort");
    expect(
      optimized.relations.find((relation) => relation.id === "l"),
    ).toMatchObject({ input: "sort" });
  });

  it("preserva sort cuando alimenta una operación stateful", () => {
    const ordering = sort();
    const stateful: RelacionVNext = {
      ...base,
      id: "state",
      op: "stateful",
      input: "sort",
      fields: [...source().fields],
      stateful: {
        projections: source().fields.map((field) => ({
          expression: field,
          alias: field,
        })),
        distinct: false,
        orderBy: [{ expression: "Fecha", direction: "asc" }],
        iterationCount: 1,
        operations: [],
      },
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), ordering, stateful], "state"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "sort")?.op,
    ).toBe("sort");
    expect(
      optimized.relations.find((relation) => relation.id === "state"),
    ).toMatchObject({ input: "sort" });
  });

  it("elimina sort no observable cuando entra directamente a aggregate", () => {
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), sort(), aggregate("sort")], "a"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "a"),
    ).toMatchObject({ input: "s" });
    expect(optimized.relations.some((relation) => relation.id === "sort")).toBe(
      false,
    );
  });
});

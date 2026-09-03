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

describe("normalización de UNION ALL", () => {
  const unionSource = (
    id: string,
    fields = ["Fecha", "monto"],
  ): RelacionVNext => ({
    ...base,
    id,
    op: "native_sql",
    fields,
    sql: `SELECT ${fields.join(", ")} FROM \`p.d.${id}\``,
    connection: "Google BigQuery:Prod",
  });
  const union = (
    id: string,
    inputs: string[],
    fields = ["Fecha", "monto"],
  ): RelacionVNext => ({
    ...base,
    id,
    op: "union_all",
    inputs,
    fields,
  });

  it("aplana UNION ALL anidado cuando los esquemas son idénticos", () => {
    const optimized = optimizarPlanRelacionalVNext(
      plan(
        [
          unionSource("s1"),
          unionSource("s2"),
          unionSource("s3"),
          union("u1", ["s1", "s2"]),
          union("u2", ["u1", "s3"]),
        ],
        "u2",
      ),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "u2"),
    ).toMatchObject({
      op: "union_all",
      inputs: ["s1", "s2", "s3"],
    });
  });

  it("conserva la rama adaptadora cuando el UNION anidado tiene esquema distinto", () => {
    const optimized = optimizarPlanRelacionalVNext(
      plan(
        [
          unionSource("s1", ["Fecha"]),
          unionSource("s2", ["Fecha"]),
          unionSource("s3"),
          union("u1", ["s1", "s2"], ["Fecha"]),
          union("u2", ["u1", "s3"]),
        ],
        "u2",
      ),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "u2"),
    ).toMatchObject({
      op: "union_all",
      inputs: ["u1", "s3"],
    });
  });
});

describe("composición de proyecciones", () => {
  const innerProject = (): RelacionVNext => ({
    ...base,
    id: "p1",
    op: "project",
    input: "s",
    fields: ["Fecha", "Anio", "CategoriaUpper", "monto"],
    projections: [
      { expression: "Fecha", alias: "Fecha" },
      { expression: "Year(Fecha)", alias: "Anio" },
      { expression: "Upper(categoria)", alias: "CategoriaUpper" },
      { expression: "monto", alias: "monto" },
    ],
  });
  const outerProject = (): RelacionVNext => ({
    ...base,
    id: "p2",
    op: "project",
    input: "p1",
    fields: ["Anio", "Etiqueta", "Doble"],
    projections: [
      { expression: "Anio", alias: "Anio" },
      { expression: "CategoriaUpper & '-' & Anio", alias: "Etiqueta" },
      { expression: "monto * 2", alias: "Doble" },
    ],
  });

  it("compone dos projects seguros y poda aliases intermedios", () => {
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), innerProject(), outerProject()], "p2"),
    );
    const output = optimized.relations.find((relation) => relation.id === "p2");
    expect(output?.op).toBe("project");
    if (output?.op !== "project") throw new Error("project esperado");
    expect(output.input).toBe("s");
    expect(output.projections).toEqual([
      { expression: "Year([Fecha])", alias: "Anio" },
      {
        expression: "((Upper([categoria]) & '-') & Year([Fecha]))",
        alias: "Etiqueta",
      },
      { expression: "([monto] * 2)", alias: "Doble" },
    ]);
  });

  it.each([
    ["distinct", { distinct: true }],
    ["mapping", { mappingLookups: [{} as never] }],
    ["dual", { dualExpressions: { Anio: "Year(Fecha)" } }],
    [
      "order",
      { orderBy: [{ expression: "Fecha", direction: "asc" as const }] },
    ],
  ])("no compone a través de project con barrera %s", (_name, patch) => {
    const blocked = { ...innerProject(), ...patch } as RelacionVNext;
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), blocked, outerProject()], "p2"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "p2"),
    ).toMatchObject({
      op: "project",
      input: "p1",
    });
  });
});

describe("distribución segura sobre UNION ALL", () => {
  const branch = (id: string, fields = ["Fecha", "monto"]): RelacionVNext => ({
    ...base,
    id,
    op: "native_sql",
    fields,
    sql: `SELECT ${fields.join(", ")} FROM \`p.d.${id}\``,
    connection: "Google BigQuery:Prod",
  });
  const union = (fields = ["Fecha", "monto"]): RelacionVNext => ({
    ...base,
    id: "u",
    op: "union_all",
    inputs: ["s1", "s2"],
    fields,
  });

  it("distribuye un filtro determinista a todas las ramas compatibles", () => {
    const output = { ...filter("u", "monto > 0"), fields: ["Fecha", "monto"] };
    const optimized = optimizarPlanRelacionalVNext(
      plan([branch("s1"), branch("s2"), union(), output], "f"),
    );
    const result = optimized.relations.find((relation) => relation.id === "f");
    expect(result?.op).toBe("union_all");
    if (result?.op !== "union_all") throw new Error("union esperado");
    expect(result.inputs).toHaveLength(2);
    expect(
      result.inputs.map((id) => optimized.relations.find((r) => r.id === id)),
    ).toEqual([
      expect.objectContaining({
        op: "filter",
        input: "s1",
        condition: "monto > 0",
      }),
      expect.objectContaining({
        op: "filter",
        input: "s2",
        condition: "monto > 0",
      }),
    ]);
  });

  it("conserva filtro exterior si alguna rama no expone el mismo esquema", () => {
    const output = { ...filter("u", "monto > 0"), fields: ["Fecha", "monto"] };
    const optimized = optimizarPlanRelacionalVNext(
      plan([branch("s1", ["Fecha"]), branch("s2"), union(), output], "f"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "u",
    });
  });

  it("distribuye una proyección determinista y poda por rama", () => {
    const output: RelacionVNext = {
      ...base,
      id: "p",
      op: "project",
      input: "u",
      fields: ["Fecha", "Doble"],
      projections: [
        { expression: "Fecha", alias: "Fecha" },
        { expression: "monto * 2", alias: "Doble" },
      ],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([branch("s1"), branch("s2"), union(), output], "p"),
    );
    const result = optimized.relations.find((relation) => relation.id === "p");
    expect(result?.op).toBe("union_all");
    if (result?.op !== "union_all") throw new Error("union esperado");
    expect(
      result.inputs.map((id) => optimized.relations.find((r) => r.id === id)),
    ).toEqual([
      expect.objectContaining({
        op: "project",
        input: "s1",
        fields: ["Fecha", "Doble"],
      }),
      expect.objectContaining({
        op: "project",
        input: "s2",
        fields: ["Fecha", "Doble"],
      }),
    ]);
  });

  it("no distribuye una proyección no determinista sobre UNION", () => {
    const output: RelacionVNext = {
      ...base,
      id: "p",
      op: "project",
      input: "u",
      fields: ["Fecha", "Aleatorio"],
      projections: [
        { expression: "Fecha", alias: "Fecha" },
        { expression: "Rand()", alias: "Aleatorio" },
      ],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([branch("s1"), branch("s2"), union(), output], "p"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "p"),
    ).toMatchObject({
      op: "project",
      input: "u",
    });
  });
});

describe("barreras adicionales de reescritura", () => {
  it("no fusiona filtros consecutivos si alguno es no determinista", () => {
    const first = {
      ...filter("s", "Rand() > 0.5", "f1"),
      fields: [...source().fields],
    };
    const second = {
      ...filter("f1", "monto > 0", "f2"),
      fields: [...source().fields],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), first, second], "f2"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f2"),
    ).toMatchObject({
      op: "filter",
      input: "f1",
    });
  });

  const aggregate = (): RelacionVNext => ({
    ...base,
    id: "a",
    op: "aggregate",
    input: "s",
    fields: ["categoria", "Total"],
    projections: [
      { expression: "categoria", alias: "categoria" },
      { expression: "Sum(monto)", alias: "Total" },
    ],
    groupBy: ["categoria"],
  });
  const finalProject = (): RelacionVNext => ({
    ...base,
    id: "p",
    op: "project",
    input: "a",
    fields: ["Categoria", "TotalFinal"],
    projections: [
      { expression: "categoria", alias: "Categoria" },
      { expression: "Total", alias: "TotalFinal" },
    ],
  });

  it("no colapsa project final sobre aggregate compartido por otra rama", () => {
    const branch: RelacionVNext = {
      ...base,
      id: "branch",
      op: "limit",
      input: "a",
      fields: ["categoria", "Total"],
      limitExpression: "5",
    };
    const input = plan([source(), aggregate(), finalProject(), branch], "p");
    input.tables = { Agregada: "a", Salida: "p" };
    const optimized = optimizarPlanRelacionalVNext(input);
    expect(optimized.outputRelationId).toBe("p");
    expect(
      optimized.relations.find((relation) => relation.id === "a"),
    ).toMatchObject({
      op: "aggregate",
      fields: ["categoria", "Total"],
    });
    expect(
      optimized.relations.find((relation) => relation.id === "branch"),
    ).toMatchObject({
      input: "a",
    });
  });

  it.each([
    [
      "order",
      { orderBy: [{ expression: "Categoria", direction: "asc" as const }] },
    ],
    ["dual", { dualExpressions: { Categoria: "categoria" } }],
  ])(
    "no colapsa project final sobre aggregate con barrera %s",
    (_name, patch) => {
      const output = { ...finalProject(), ...patch } as RelacionVNext;
      const optimized = optimizarPlanRelacionalVNext(
        plan([source(), aggregate(), output], "p"),
      );
      expect(optimized.outputRelationId).toBe("p");
      expect(
        optimized.relations.find((relation) => relation.id === "p")?.op,
      ).toBe("project");
    },
  );
});
describe("idempotencia estructural compuesta", () => {
  it("alcanza punto fijo combinando projects, INNER JOIN, filtro y UNION ALL anidado", () => {
    const left: RelacionVNext = {
      ...base,
      id: "l",
      op: "native_sql",
      fields: ["id", "left_value"],
      sql: "SELECT id, left_value FROM `p.d.left`",
      connection: "Google BigQuery:Prod",
    };
    const right: RelacionVNext = {
      ...base,
      id: "r",
      op: "native_sql",
      fields: ["id", "right_value"],
      sql: "SELECT id, right_value FROM `p.d.right`",
      connection: "Google BigQuery:Prod",
    };
    const join: RelacionVNext = {
      ...base,
      id: "j",
      op: "join",
      left: "l",
      right: "r",
      join: "inner",
      keys: ["id"],
      fields: ["id", "left_value", "right_value"],
    };
    const firstProject: RelacionVNext = {
      ...base,
      id: "p1",
      op: "project",
      input: "j",
      fields: ["id", "Izquierda", "Derecha"],
      projections: [
        { expression: "id", alias: "id" },
        { expression: "left_value", alias: "Izquierda" },
        { expression: "right_value", alias: "Derecha" },
      ],
    };
    const secondProject: RelacionVNext = {
      ...base,
      id: "p2",
      op: "project",
      input: "p1",
      fields: ["id", "Izquierda"],
      projections: [
        { expression: "id", alias: "id" },
        { expression: "Izquierda", alias: "Izquierda" },
      ],
    };
    const filtered: RelacionVNext = {
      ...base,
      id: "f",
      op: "filter",
      input: "p2",
      condition: "Izquierda > 0",
      fields: ["id", "Izquierda"],
    };
    const extra = (id: string): RelacionVNext => ({
      ...base,
      id,
      op: "native_sql",
      fields: ["id", "Izquierda"],
      sql: `SELECT id, Izquierda FROM \`p.d.${id}\``,
      connection: "Google BigQuery:Prod",
    });
    const u1: RelacionVNext = {
      ...base,
      id: "u1",
      op: "union_all",
      inputs: ["f", "s3"],
      fields: ["id", "Izquierda"],
    };
    const u2: RelacionVNext = {
      ...base,
      id: "u2",
      op: "union_all",
      inputs: ["u1", "s4"],
      fields: ["id", "Izquierda"],
    };

    const once = optimizarPlanRelacionalVNext(
      plan(
        [
          left,
          right,
          join,
          firstProject,
          secondProject,
          filtered,
          extra("s3"),
          extra("s4"),
          u1,
          u2,
        ],
        "u2",
      ),
    );
    const twice = optimizarPlanRelacionalVNext(once);
    expect(twice).toEqual(once);
    expect(
      once.relations.find((relation) => relation.id === "u2"),
    ).toMatchObject({
      op: "union_all",
      inputs: ["f", "s3", "s4"],
    });
  });
});

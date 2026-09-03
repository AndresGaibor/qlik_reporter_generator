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

describe("optimizador IR relacional", () => {
  it("empuja un filtro por una proyección segura sin mutar la proyección original", () => {
    const originalProject = project();
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), originalProject, filter("p", "Anio = 2026")], "f"),
    );

    const output = optimized.relations.find((relation) => relation.id === "f");
    expect(output?.op).toBe("project");
    if (output?.op !== "project") throw new Error("salida esperada project");
    const pushed = optimized.relations.find(
      (relation) => relation.id === output.input,
    );
    expect(pushed).toMatchObject({
      op: "filter",
      input: "s",
      condition: "(Year([Fecha]) = 2026)",
    });
    expect(optimized.relations.find((relation) => relation.id === "p")).toEqual(
      originalProject,
    );
  });

  it("fusiona filtros consecutivos preservando precedencia", () => {
    const first = filter("s", "monto > 0", "f1");
    const second = {
      ...filter("f1", "categoria = 'A'", "f2"),
      fields: source().fields,
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), first, second], "f2"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f2"),
    ).toMatchObject({
      op: "filter",
      input: "s",
      condition: "(monto > 0) and (categoria = 'A')",
    });
  });

  it("elimina una proyección identidad incluso sobre SQL nativo y redirige tablas", () => {
    const identity: RelacionVNext = {
      ...base,
      id: "p",
      op: "project",
      input: "s",
      fields: source().fields,
      projections: source().fields.map((field) => ({
        expression: field,
        alias: field,
      })),
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), identity], "p"),
    );
    expect(optimized.outputRelationId).toBe("s");
    expect(optimized.tables.Salida).toBe("s");
    expect(optimized.relations.some((relation) => relation.id === "p")).toBe(
      false,
    );
  });

  it.each([
    ["distinct", { distinct: true }],
    ["mapping", { mappingLookups: [{} as never] }],
    ["mapsubstring", { mapSubstringLookups: [{} as never] }],
    ["dual", { dualExpressions: { Anio: "Year(Fecha)" } }],
    [
      "order",
      { orderBy: [{ expression: "Fecha", direction: "asc" as const }] },
    ],
  ])(
    "conserva el filtro por encima de project cuando existe barrera %s",
    (_name, patch) => {
      const blocked = { ...project(), ...patch } as RelacionVNext;
      const optimized = optimizarPlanRelacionalVNext(
        plan([source(), blocked, filter("p", "Fecha = '2026-01-01'")], "f"),
      );
      expect(
        optimized.relations.find((relation) => relation.id === "f"),
      ).toMatchObject({
        op: "filter",
        input: "p",
      });
    },
  );

  it("no empuja filter/project cuando la proyección es no determinista", () => {
    const volatileProject: RelacionVNext = {
      ...project(),
      fields: ["Fecha", "Aleatorio", "monto"],
      projections: [
        { expression: "Fecha", alias: "Fecha" },
        { expression: "Rand()", alias: "Aleatorio" },
        { expression: "monto", alias: "monto" },
      ],
    };
    const output = {
      ...filter("p", "Aleatorio > 0.5"),
      fields: [...volatileProject.fields],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), volatileProject, output], "f"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "p",
    });
  });

  it("es idempotente para filter/project ya normalizado", () => {
    const once = optimizarPlanRelacionalVNext(
      plan([source(), project(), filter("p", "Anio = 2026")], "f"),
    );
    const twice = optimizarPlanRelacionalVNext(once);
    expect(twice).toEqual(once);
  });
});

describe("convergencia del optimizador", () => {
  it("normaliza cadenas de filtros más profundas que el antiguo límite de 20", () => {
    const relations: RelacionVNext[] = [source()];
    let input = "s";
    for (let index = 1; index <= 40; index += 1) {
      const id = `f${index}`;
      relations.push({
        ...filter(input, `monto > ${index}`, id),
        fields: [...source().fields],
      });
      input = id;
    }
    const optimized = optimizarPlanRelacionalVNext(plan(relations, input));
    const output = optimized.relations.find(
      (relation) => relation.id === input,
    );
    expect(output).toMatchObject({ op: "filter", input: "s" });
    const twice = optimizarPlanRelacionalVNext(optimized);
    expect(twice).toEqual(optimized);
  });
});

describe("barreras de provenance del optimizador", () => {
  it("no invierte filter/project cuando la fuente todavía no expone campos IR", () => {
    const opaqueSource: RelacionVNext = {
      ...source(),
      fields: [],
      schemaKnown: false,
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([opaqueSource, project(), filter("p", "Anio = 2026")], "f"),
    );
    expect(
      optimized.relations.find((relation) => relation.id === "f"),
    ).toMatchObject({
      op: "filter",
      input: "p",
    });
  });
});

describe("seguridad de relaciones compartidas", () => {
  it("no elimina un project usado por aggregate y por otra rama RESIDENT", () => {
    const p = project();
    const aggregate: RelacionVNext = {
      ...base,
      id: "a",
      op: "aggregate",
      input: "p",
      fields: ["Anio", "Total"],
      projections: [
        { expression: "Anio", alias: "Anio" },
        { expression: "Sum(monto)", alias: "Total" },
      ],
      groupBy: ["Anio"],
    };
    const branch: RelacionVNext = {
      ...base,
      id: "branch",
      op: "limit",
      input: "p",
      fields: [...p.fields],
      limitExpression: "10",
    };
    const input = plan([source(), p, aggregate, branch], "a");
    input.tables = { Base: "p", Salida: "a" };
    const optimized = optimizarPlanRelacionalVNext(input);

    expect(
      optimized.relations.find((relation) => relation.id === "p")?.op,
    ).toBe("project");
    expect(
      optimized.relations.find((relation) => relation.id === "a"),
    ).toMatchObject({
      op: "aggregate",
      input: "p",
    });
    expect(
      optimized.relations.find((relation) => relation.id === "branch"),
    ).toMatchObject({
      op: "limit",
      input: "p",
    });
  });

  it("redirige el ancla de tabla al fusionar project final sobre aggregate", () => {
    const aggregate: RelacionVNext = {
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
    };
    const output: RelacionVNext = {
      ...base,
      id: "p",
      op: "project",
      input: "a",
      fields: ["categoria", "TotalFinal", "Tipo"],
      projections: [
        { expression: "categoria", alias: "categoria" },
        { expression: "Total", alias: "TotalFinal" },
        { expression: "'Ventas'", alias: "Tipo" },
      ],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), aggregate, output], "p"),
    );
    expect(optimized.outputRelationId).toBe("a");
    expect(optimized.tables.Salida).toBe("a");
  });
});

describe("redirección completa de referencias IR", () => {
  const identity = (): RelacionVNext => ({
    ...base,
    id: "p",
    op: "project",
    input: "s",
    fields: source().fields,
    projections: source().fields.map((field) => ({
      expression: field,
      alias: field,
    })),
  });

  it("redirige semi_filter.against al eliminar una identidad", () => {
    const inputSource = source("i");
    const semi: RelacionVNext = {
      ...base,
      id: "semi",
      op: "semi_filter",
      input: "i",
      against: "p",
      keys: ["Fecha"],
      fields: [...inputSource.fields],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), inputSource, identity(), semi], "semi"),
    );
    expect(optimized.relations.find((r) => r.id === "semi")).toMatchObject({
      op: "semi_filter",
      against: "s",
    });
  });

  it("redirige relationId de mapping lookups al eliminar una identidad", () => {
    const consumer: RelacionVNext = {
      ...project("s", "consumer"),
      mappingLookups: [{ relationId: "p" } as never],
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), identity(), consumer], "consumer"),
    );
    const output = optimized.relations.find((r) => r.id === "consumer");
    expect(output?.op).toBe("project");
    if (output?.op !== "project") throw new Error("project esperado");
    expect(output.mappingLookups?.[0]?.relationId).toBe("s");
  });

  it("redirige stateful Exists.against al eliminar una identidad", () => {
    const inputSource = source("i");
    const stateful: RelacionVNext = {
      ...base,
      id: "state",
      op: "stateful",
      input: "i",
      fields: [...inputSource.fields],
      stateful: {
        projections: [],
        distinct: false,
        orderBy: [],
        iterationCount: 1,
        operations: [],
        exists: { field: "Fecha", valueExpression: "Fecha", against: "p" },
      },
    };
    const optimized = optimizarPlanRelacionalVNext(
      plan([source(), inputSource, identity(), stateful], "state"),
    );
    const output = optimized.relations.find((r) => r.id === "state");
    expect(output?.op).toBe("stateful");
    if (output?.op !== "stateful") throw new Error("stateful esperado");
    expect(output.stateful.exists?.against).toBe("s");
  });
});

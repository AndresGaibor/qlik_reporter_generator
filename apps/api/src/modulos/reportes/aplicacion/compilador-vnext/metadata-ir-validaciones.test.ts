import { describe, expect, it } from "bun:test";
import type { PlanCompilacionVNext } from "./ir.js";
import { enriquecerPlanConMetadataBigQuery } from "./metadata-ir.js";

const span = {
  start: 0,
  end: 0,
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
};

describe("validación de tipos en JOINs", () => {
  it("no produce diagnóstico cuando los tipos de key son iguales", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "left",
          op: "native_sql",
          sql: "SELECT id, nombre FROM `p.d.a`",
          connection: "BigQuery",
          fields: ["id", "nombre"],
          schemaKnown: true,
          span,
        },
        {
          id: "right",
          op: "native_sql",
          sql: "SELECT id, zona FROM `p.d.b`",
          connection: "BigQuery",
          fields: ["id", "zona"],
          schemaKnown: true,
          span,
        },
        {
          id: "j1",
          op: "join",
          left: "left",
          right: "right",
          join: "inner",
          keys: ["id"],
          fields: ["id", "nombre", "zona"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "j1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          nombre: { type: "STRING", mode: "NULLABLE" },
        },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          zona: { type: "STRING", mode: "NULLABLE" },
        },
      },
    });
    const joinDiags = result.diagnostics.filter((d) =>
      d.code.startsWith("JOIN_KEY_TYPE"),
    );
    expect(joinDiags).toHaveLength(0);
  });

  it("produce diagnóstico cuando los tipos de key son incompatibles", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "left",
          op: "native_sql",
          sql: "SELECT id, nombre FROM `p.d.a`",
          connection: "BigQuery",
          fields: ["id", "nombre"],
          schemaKnown: true,
          span,
        },
        {
          id: "right",
          op: "native_sql",
          sql: "SELECT id, zona FROM `p.d.b`",
          connection: "BigQuery",
          fields: ["id", "zona"],
          schemaKnown: true,
          span,
        },
        {
          id: "j1",
          op: "join",
          left: "left",
          right: "right",
          join: "inner",
          keys: ["id"],
          fields: ["id", "nombre", "zona"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "j1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          nombre: { type: "STRING", mode: "NULLABLE" },
        },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "STRING", mode: "NULLABLE" },
          zona: { type: "STRING", mode: "NULLABLE" },
        },
      },
    });
    const joinDiags = result.diagnostics.filter((d) =>
      d.code.startsWith("JOIN_KEY_TYPE"),
    );
    expect(joinDiags.length).toBeGreaterThan(0);
    expect(joinDiags[0].category).toBe("TYPE_SEMANTICS");
    expect(joinDiags[0].message).toContain("INT64");
    expect(joinDiags[0].message).toContain("STRING");
  });

  it("no bloquea cuando un lado tiene tipo desconocido", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "left",
          op: "native_sql",
          sql: "SELECT id, nombre FROM `p.d.a`",
          connection: "BigQuery",
          fields: ["id", "nombre"],
          schemaKnown: true,
          span,
        },
        {
          id: "right",
          op: "native_sql",
          sql: "SELECT id, zona FROM `p.d.b`",
          connection: "BigQuery",
          fields: ["id", "zona"],
          schemaKnown: false,
          span,
        },
        {
          id: "j1",
          op: "join",
          left: "left",
          right: "right",
          join: "inner",
          keys: ["id"],
          fields: ["id", "nombre", "zona"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "j1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          nombre: { type: "STRING", mode: "NULLABLE" },
        },
      },
    });
    const joinDiags = result.diagnostics.filter((d) =>
      d.code.startsWith("JOIN_KEY_TYPE"),
    );
    expect(joinDiags).toHaveLength(0);
  });

  it("muestra fuentes en el diagnóstico cuando están disponibles", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "left",
          op: "native_sql",
          sql: "SELECT Fecha FROM `p.d.a`",
          connection: "BigQuery",
          fields: ["Fecha"],
          schemaKnown: true,
          span,
        },
        {
          id: "right",
          op: "native_sql",
          sql: "SELECT Fecha FROM `p.d.b`",
          connection: "BigQuery",
          fields: ["Fecha"],
          schemaKnown: true,
          span,
        },
        {
          id: "j1",
          op: "join",
          left: "left",
          right: "right",
          join: "inner",
          keys: ["Fecha"],
          fields: ["Fecha"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "j1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: { Fecha: { type: "DATE", mode: "REQUIRED" } },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: { Fecha: { type: "STRING", mode: "NULLABLE" } },
      },
    });
    const joinDiags = result.diagnostics.filter((d) =>
      d.code.startsWith("JOIN_KEY_TYPE"),
    );
    expect(joinDiags.length).toBeGreaterThan(0);
    expect(joinDiags[0].message).toContain("DATE");
    expect(joinDiags[0].message).toContain("STRING");
  });
});

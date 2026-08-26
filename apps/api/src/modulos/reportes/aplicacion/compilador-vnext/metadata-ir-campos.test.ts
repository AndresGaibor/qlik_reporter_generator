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

describe("nullability en JOINs", () => {
  it("LEFT JOIN marca campos derecha como NULLABLE", () => {
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
          join: "left",
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
          nombre: { type: "STRING", mode: "REQUIRED" },
        },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          zona: { type: "STRING", mode: "REQUIRED" },
        },
      },
    });
    const joinRelation = result.relations.find((r) => r.id === "j1");
    expect(joinRelation?.fieldMetadata?.nombre?.mode).toBe("REQUIRED");
    expect(joinRelation?.fieldMetadata?.zona?.mode).toBe("NULLABLE");
  });

  it("RIGHT JOIN marca campos izquierda como NULLABLE", () => {
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
          join: "right",
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
          nombre: { type: "STRING", mode: "REQUIRED" },
        },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          zona: { type: "STRING", mode: "REQUIRED" },
        },
      },
    });
    const joinRelation = result.relations.find((r) => r.id === "j1");
    expect(joinRelation?.fieldMetadata?.nombre?.mode).toBe("NULLABLE");
    expect(joinRelation?.fieldMetadata?.zona?.mode).toBe("REQUIRED");
  });

  it("FULL JOIN marca todos los campos como NULLABLE", () => {
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
          join: "full",
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
          nombre: { type: "STRING", mode: "REQUIRED" },
        },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          zona: { type: "STRING", mode: "REQUIRED" },
        },
      },
    });
    const joinRelation = result.relations.find((r) => r.id === "j1");
    expect(joinRelation?.fieldMetadata?.id?.mode).toBe("NULLABLE");
    expect(joinRelation?.fieldMetadata?.nombre?.mode).toBe("NULLABLE");
    expect(joinRelation?.fieldMetadata?.zona?.mode).toBe("NULLABLE");
  });

  it("INNER JOIN preserva nullability original", () => {
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
          nombre: { type: "STRING", mode: "REQUIRED" },
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
    const joinRelation = result.relations.find((r) => r.id === "j1");
    expect(joinRelation?.fieldMetadata?.id?.mode).toBe("REQUIRED");
    expect(joinRelation?.fieldMetadata?.nombre?.mode).toBe("REQUIRED");
    expect(joinRelation?.fieldMetadata?.zona?.mode).toBe("NULLABLE");
  });
});

describe("SchemaKnown y validación de campos", () => {
  it("SELECT simple con metadata produce schemaKnown true", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT Fecha, Cantidad FROM `p.d.ventas`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "r1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.ventas": {
        tableId: "p.d.ventas",
        fields: {
          Fecha: { type: "DATE", mode: "REQUIRED" },
          Cantidad: { type: "NUMERIC", mode: "NULLABLE" },
        },
      },
    });
    const relation = result.relations[0];
    expect(relation?.schemaKnown).toBe(true);
    expect(relation?.fieldMetadata?.Fecha?.type).toBe("DATE");
  });

  it("SELECT con AS preserva metadata del campo original", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT NOM_FEC AS Fecha FROM `p.d.dim_fecha`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "r1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.dim_fecha": {
        tableId: "p.d.dim_fecha",
        fields: { NOM_FEC: { type: "DATE", mode: "REQUIRED" } },
      },
    });
    const relation = result.relations[0];
    expect(relation?.schemaKnown).toBe(true);
    expect(relation?.fieldMetadata?.Fecha?.type).toBe("DATE");
  });

  it("SQL complejo con JOIN interno queda schemaKnown false", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT a.id, b.nombre FROM `p.d.a` a INNER JOIN `p.d.b` b ON a.id = b.id",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "r1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.a": {
        tableId: "p.d.a",
        fields: { id: { type: "INT64", mode: "REQUIRED" } },
      },
      "p.d.b": {
        tableId: "p.d.b",
        fields: {
          id: { type: "INT64", mode: "REQUIRED" },
          nombre: { type: "STRING", mode: "NULLABLE" },
        },
      },
    });
    const relation = result.relations[0];
    expect(relation?.schemaKnown).toBe(false);
  });

  it("proyección de campo inexistente desde schemaKnown produce diagnóstico", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT Fecha, Cantidad FROM `p.d.ventas`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
        {
          id: "p1",
          op: "project",
          input: "r1",
          projections: [
            { expression: "Fecha", alias: "Fecha" },
            { expression: "Inexistente", alias: "Inexistente" },
          ],
          fields: ["Fecha", "Inexistente"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "p1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.ventas": {
        tableId: "p.d.ventas",
        fields: {
          Fecha: { type: "DATE", mode: "REQUIRED" },
          Cantidad: { type: "NUMERIC", mode: "NULLABLE" },
        },
      },
    });
    const fieldDiags = result.diagnostics.filter(
      (d) => d.code === "SCHEMA_KNOWN_FIELD_NOT_FOUND",
    );
    expect(fieldDiags.length).toBeGreaterThan(0);
    expect(fieldDiags[0].message).toContain("Inexistente");
  });

  it("no produce diagnóstico cuando el campo es calculado (expresión)", () => {
    const plan: PlanCompilacionVNext = {
      relations: [
        {
          id: "r1",
          op: "native_sql",
          sql: "SELECT Fecha, Cantidad FROM `p.d.ventas`",
          connection: "BigQuery",
          fields: [],
          schemaKnown: false,
          span,
        },
        {
          id: "p1",
          op: "project",
          input: "r1",
          projections: [
            { expression: "Fecha", alias: "Fecha" },
            { expression: "Year(Fecha)", alias: "Anio" },
          ],
          fields: ["Fecha", "Anio"],
          schemaKnown: false,
          span,
        },
      ],
      effects: [],
      tables: {},
      mappings: {},
      outputRelationId: "p1",
      diagnostics: [],
    };
    const result = enriquecerPlanConMetadataBigQuery(plan, {
      "p.d.ventas": {
        tableId: "p.d.ventas",
        fields: {
          Fecha: { type: "DATE", mode: "REQUIRED" },
          Cantidad: { type: "NUMERIC", mode: "NULLABLE" },
        },
      },
    });
    const fieldDiags = result.diagnostics.filter(
      (d) => d.code === "SCHEMA_KNOWN_FIELD_NOT_FOUND",
    );
    expect(fieldDiags).toHaveLength(0);
  });
});

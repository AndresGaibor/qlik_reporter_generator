import { describe, it, expect } from "bun:test";
import { EvaluadorPreview } from "./evaluador-preview";
import type { PlanCompilacionVNext, RelacionVNext } from "./compilador-vnext/ir.js";

const spanBase = { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };

describe("EvaluadorPreview", () => {
  const hacerPlanConRelacion = (relacion: RelacionVNext): PlanCompilacionVNext => ({
    relations: [relacion],
    effects: [],
    tables: {},
    mappings: {},
    outputRelationId: relacion.id,
    diagnostics: [],
  });

  describe("proyección de campos (alias)", () => {
    it("aplica aliases de columnas", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [
          { expression: "nombre", alias: "Nombre Completo" },
          { expression: "edad", alias: "Edad del Cliente" },
        ],
        fields: ["nombre", "edad"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = {
        columnas: ["nombre", "edad"],
        filas: [["Ana", "30"], ["Luis", "25"]],
      };

      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.columnas).toEqual(["Nombre Completo", "Edad del Cliente"]);
      expect(resultado.filas).toEqual([["Ana", "30"], ["Luis", "25"]]);
    });
  });

  describe(" LEFT() y RIGHT()", () => {
    it("aplica LEFT(campo, n)", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [
          { expression: "LEFT(codigo,3)", alias: "Prefijo" },
        ],
        fields: ["codigo"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = { columnas: ["codigo"], filas: [["ABC123"]], };
      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.filas[0][0]).toBe("ABC");
    });
  });

  describe("agregaciones", () => {
    it("AVG se calcula sobre la muestra", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "aggregate",
        input: "fuente1",
        projections: [
          { expression: "AVG(ventas)", alias: "Promedio Ventas" },
        ],
        groupBy: [],
        fields: ["ventas"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = { columnas: ["ventas"], filas: [["100"], ["200"], ["300"]] };
      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.contieneAgregaciones).toBe(true);
      expect(resultado.filas[0][0]).toBe("200"); // AVG(100,200,300) = 200
    });
  });

  describe("filtros", () => {
    it("aplica filtro en memoria", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "filter",
        input: "fuente1",
        condition: "edad > 25",
        fields: ["nombre", "edad"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = {
        columnas: ["nombre", "edad"],
        filas: [["Ana", "30"], ["Luis", "25"], ["Sofia", "28"]],
      };

      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.filas.map((f: string[]) => f[0])).toEqual(["Ana", "Sofia"]);
    });
  });

  describe("joins", () => {
    it("hace join de dos fuentes en memoria", () => {
      const plan: PlanCompilacionVNext = {
        relations: [
          {
            id: "left",
            op: "inline",
            columns: ["id", "nombre"],
            rows: [["1", "Ana"]],
            fields: ["id", "nombre"],
            schemaKnown: false,
            span: spanBase,
          },
          {
            id: "right",
            op: "inline",
            columns: ["id", "ventas"],
            rows: [["1", "100"]],
            fields: ["id", "ventas"],
            schemaKnown: false,
            span: spanBase,
          },
          {
            id: "joined",
            op: "join",
            left: "left",
            right: "right",
            join: "inner",
            keys: ["id"],
            fields: [],
            schemaKnown: false,
            span: spanBase,
          },
        ],
        effects: [],
        tables: {},
        mappings: {},
        outputRelationId: "joined",
        diagnostics: [],
      };

      const preview = new EvaluadorPreview(plan);
      const resultado = preview.evaluarInline({
        left: { columnas: ["id", "nombre"], filas: [["1", "Ana"]] },
        right: { columnas: ["id", "ventas"], filas: [["1", "100"]] },
      });

      expect(resultado.filas[0]).toContain("Ana");
      expect(resultado.filas[0]).toContain("100");
    });

    it("advierte si no hay coincidencias en join", () => {
      const plan: PlanCompilacionVNext = {
        relations: [
          {
            id: "left",
            op: "inline",
            columns: ["id", "nombre"],
            rows: [["1", "Ana"]],
            fields: ["id", "nombre"],
            schemaKnown: false,
            span: spanBase,
          },
          {
            id: "right",
            op: "inline",
            columns: ["id", "ventas"],
            rows: [["2", "100"]], // id diferente
            fields: ["id", "ventas"],
            schemaKnown: false,
            span: spanBase,
          },
          {
            id: "joined",
            op: "join",
            left: "left",
            right: "right",
            join: "inner",
            keys: ["id"],
            fields: [],
            schemaKnown: false,
            span: spanBase,
          },
        ],
        effects: [],
        tables: {},
        mappings: {},
        outputRelationId: "joined",
        diagnostics: [],
      };

      const preview = new EvaluadorPreview(plan);
      const resultado = preview.evaluarInline({
        left: { columnas: ["id", "nombre"], filas: [["1", "Ana"]] },
        right: { columnas: ["id", "ventas"], filas: [["2", "100"]] },
      });

      expect(resultado.advertencias).toContainEqual(
        expect.stringContaining("coincidencias"),
      );
    });
  });

  describe("integridad: nunca usa createQueryJob", () => {
    it("el evaluador solo procesa datos en memoria", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [{ expression: "campo1", alias: "Alias1" }],
        fields: ["campo1"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = { columnas: ["campo1"], filas: [["valor1"]] };
      const evaluador = new EvaluadorPreview(plan);

      expect(typeof (evaluador as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
      expect(typeof (evaluador as unknown as { ejecutarQuery?: unknown }).ejecutarQuery).toBe("undefined");
    });
  });
});

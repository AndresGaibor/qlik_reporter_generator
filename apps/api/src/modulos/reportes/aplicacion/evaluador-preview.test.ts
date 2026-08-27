import { describe, expect, it } from "bun:test";
import type {
  PlanCompilacionVNext,
  RelacionVNext,
} from "./compilador-vnext/ir.js";
import { EvaluadorPreview } from "./evaluador-preview";

const spanBase = {
  start: 0,
  end: 0,
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
};

function crearPlanJoin(
  join: "inner" | "left" | "right" | "full",
): PlanCompilacionVNext {
  return {
    relations: [
      {
        id: "left",
        op: "inline",
        columns: ["id", "nombre"],
        rows: [],
        fields: ["id", "nombre"],
        schemaKnown: false,
        span: spanBase,
      },
      {
        id: "right",
        op: "inline",
        columns: ["id", "ventas"],
        rows: [],
        fields: ["id", "ventas"],
        schemaKnown: false,
        span: spanBase,
      },
      {
        id: "joined",
        op: "join",
        left: "left",
        right: "right",
        join,
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
}

describe("EvaluadorPreview", () => {
  const hacerPlanConRelacion = (
    relacion: RelacionVNext,
  ): PlanCompilacionVNext => ({
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
        filas: [
          ["Ana", "30"],
          ["Luis", "25"],
        ],
      };

      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.columnas).toEqual([
        "Nombre Completo",
        "Edad del Cliente",
      ]);
      expect(resultado.filas).toEqual([
        ["Ana", "30"],
        ["Luis", "25"],
      ]);
    });
  });

  describe(" LEFT() y RIGHT()", () => {
    it("aplica LEFT(campo, n)", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [{ expression: "LEFT(codigo,3)", alias: "Prefijo" }],
        fields: ["codigo"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = { columnas: ["codigo"], filas: [["ABC123"]] };
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
        projections: [{ expression: "AVG(ventas)", alias: "Promedio Ventas" }],
        groupBy: [],
        fields: ["ventas"],
        schemaKnown: false,
        span: spanBase,
      });

      const datos = {
        columnas: ["ventas"],
        filas: [["100"], ["200"], ["300"]],
      };
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
        filas: [
          ["Ana", "30"],
          ["Luis", "25"],
          ["Sofia", "28"],
        ],
      };

      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.filas.map((f: string[]) => f[0])).toEqual([
        "Ana",
        "Sofia",
      ]);
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

      expect(resultado.advertencias).not.toContainEqual(
        expect.stringContaining("coincidencias"),
      );
    });

    it("armoniza keys localmente y un INNER JOIN no queda vacío por HEAD no coincidentes", () => {
      const plan = crearPlanJoin("inner");
      const resultado = new EvaluadorPreview(plan).evaluarInline({
        left: { columnas: ["id", "nombre"], filas: [["824829", "Ana"]] },
        right: { columnas: ["id", "ventas"], filas: [["991288", "100"]] },
      });

      expect(resultado.filas).toHaveLength(1);
      expect(resultado.filas[0]).toContain("Ana");
      expect(resultado.filas[0]).toContain("100");
      expect(resultado.advertencias.join(" ")).not.toMatch(
        /muestra|coincidencias/i,
      );
    });

    it("proyecta el resultado del join sin advertencia basada en muestras", () => {
      const plan: PlanCompilacionVNext = {
        relations: [
          {
            id: "left",
            op: "inline",
            columns: ["id", "nombre"],
            rows: [["1", "Ana"]],
            fields: ["id", "nombre"],
            schemaKnown: false,
            span: {
              start: 1,
              end: 1,
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            },
          },
          {
            id: "right",
            op: "inline",
            columns: ["id", "ventas"],
            rows: [["2", "100"]],
            fields: ["id", "ventas"],
            schemaKnown: false,
            span: {
              start: 1,
              end: 1,
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            },
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
            span: {
              start: 1,
              end: 1,
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            },
          },
          {
            id: "projected",
            op: "project",
            input: "joined",
            projections: [{ expression: "nombre", alias: "Nombre" }],
            fields: ["Nombre"],
            schemaKnown: false,
            span: {
              start: 1,
              end: 1,
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            },
          },
        ],
        effects: [],
        tables: {},
        mappings: {},
        outputRelationId: "projected",
        diagnostics: [],
      };

      const resultado = new EvaluadorPreview(plan).evaluarInline({
        left: { columnas: ["id", "nombre"], filas: [["1", "Ana"]] },
        right: { columnas: ["id", "ventas"], filas: [["2", "100"]] },
      });

      expect(resultado.filas).toEqual([["Ana"]]);
      expect(resultado.advertencias.join(" ")).not.toMatch(
        /muestra|coincidencias/i,
      );
    });
  });

  describe("expresiones simples de Qlik", () => {
    it("resuelve referencias entre corchetes y literales sin mostrar sintaxis cruda", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [
          { expression: "[Año_year]", alias: "Año" },
          { expression: "[NOM_MES]", alias: "Mes" },
          { expression: "'Ventas'", alias: "Tipo" },
          { expression: '"14.Ventas"', alias: "Transacción" },
          { expression: "0", alias: "Cero" },
          { expression: "12.50", alias: "Decimal" },
        ],
        fields: ["Año", "Mes", "Tipo", "Transacción", "Cero", "Decimal"],
        schemaKnown: false,
        span: spanBase,
      });

      const resultado = new EvaluadorPreview(plan).evaluar({
        columnas: ["Año_year", "NOM_MES"],
        filas: [["2026", "Julio"]],
      });

      expect(resultado.filas[0]).toEqual([
        "2026",
        "Julio",
        "Ventas",
        "14.Ventas",
        "0",
        "12.50",
      ]);
    });

    it("aplica RIGHT con referencias de campo", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "project",
        input: "fuente1",
        projections: [{ expression: "RIGHT([codigo],3)", alias: "Sufijo" }],
        fields: ["Sufijo"],
        schemaKnown: false,
        span: spanBase,
      });

      const resultado = new EvaluadorPreview(plan).evaluar({
        columnas: ["codigo"],
        filas: [["ABC123"]],
      });
      expect(resultado.filas[0][0]).toBe("123");
    });

    it("GROUP BY conserva dimensiones reales con corchetes y agrega localmente", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "aggregate",
        input: "fuente1",
        projections: [
          { expression: "[Proveedor]", alias: "Proveedor" },
          { expression: "AVG([ventas])", alias: "Promedio" },
          { expression: "COUNT([ventas])", alias: "Cantidad" },
          { expression: "MIN([ventas])", alias: "Minimo" },
          { expression: "MAX([ventas])", alias: "Maximo" },
        ],
        groupBy: ["[Proveedor]"],
        fields: ["Proveedor", "Promedio", "Cantidad", "Minimo", "Maximo"],
        schemaKnown: false,
        span: spanBase,
      });

      const resultado = new EvaluadorPreview(plan).evaluar({
        columnas: ["Proveedor", "ventas"],
        filas: [
          ["PROVEEDOR REAL", "10"],
          ["PROVEEDOR REAL", "20"],
          ["OTRO PROVEEDOR", "50"],
        ],
      });

      expect(resultado.filas).toEqual([
        ["PROVEEDOR REAL", "15", "2", "10", "20"],
        ["OTRO PROVEEDOR", "50", "1", "50", "50"],
      ]);
    });

    it("SUM se calcula sobre los datos sintéticos en memoria", () => {
      const plan = hacerPlanConRelacion({
        id: "r1",
        op: "aggregate",
        input: "fuente1",
        projections: [{ expression: "SUM(ventas)", alias: "Ventas" }],
        groupBy: [],
        fields: ["Ventas"],
        schemaKnown: false,
        span: spanBase,
      });

      const resultado = new EvaluadorPreview(plan).evaluar({
        columnas: ["ventas"],
        filas: [["10"], ["20"], ["30"]],
      });
      expect(resultado.filas[0][0]).toBe("60");
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

      expect(
        typeof (evaluador as unknown as { createQueryJob?: unknown })
          .createQueryJob,
      ).toBe("undefined");
      expect(
        typeof (evaluador as unknown as { ejecutarQuery?: unknown })
          .ejecutarQuery,
      ).toBe("undefined");
    });
  });
});

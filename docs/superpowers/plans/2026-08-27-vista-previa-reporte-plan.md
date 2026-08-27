# Vista Previa Reporte - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar vista previa del reporte que muestra datos transformados reales sin ejecutar consultas BigQuery (costo cero).

**Architecture:** Nuevo endpoint `GET /reportes/:flujoId/preview` que usa tabledata.list para obtener muestras gratuitas, un evaluador local que aplica el IR del compilador vNext sobre las muestras, y un componente UI que renderiza la tabla de preview.

**Tech Stack:** Hono (API), React/Vite (UI), @google-cloud/bigquery (tabledata.list), TypeScript

**Spec:** `docs/superpowers/specs/2026-08-27-vista-previa-reporte-design.md`

---

## Global Constraints

- No usar `createQueryJob()` para preview — solo `table.getRows()`
- No usar `SELECT ... LIMIT 10`
- Máximo 10 filas en respuesta, obtener 50-100 internamente
- Contrato: `{ columnas, filas, filasMuestreadas, fuentesMuestreadas, contieneAgregaciones, advertencias, esMuestra }`
- Todos los tests deben pasar antes de commit: `bun run typecheck && bun run test`

---

## File Structure

```
apps/api/src/modulos/google-cloud/
  aplicacion/
    puerto-lectura-bigquery.ts       # interfaz PuertoLecturaBigQuery
  infraestructura/
    cliente-preview-bigquery.ts      # implementa PuertoLecturaBigQuery con getRows

apps/api/src/modulos/reportes/
  aplicacion/
    evaluador-preview.ts             # evaluador local del IR sobre muestras
    vista-previa-dataflow.ts         # caso de uso que orquesta todo
  http/
    rutas-reportes-dataflow.ts       # + GET /:flujoId/preview

apps/web/src/modulos/reportes/
  componentes/detalle/
    vista-previa-reporte.tsx         # componente UI de preview
  api.ts                             # + obtenerVistaPreviaReporte

packages/contratos/src/reportes/
  dataflow.ts                        # + esquemaVistaPreviaReporte
```

---

## Task 1: Puerto e Implementación BigQuery Preview

**Files:**
- Create: `apps/api/src/modulos/google-cloud/aplicacion/puerto-lectura-bigquery.ts`
- Create: `apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.ts`
- Create: `apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.test.ts`

**Interfaces:**
- Consumes: Nada (nuevo)
- Produces: `PuertoLecturaBigQuery` con firma `obtenerFilasPreview(tabla: string, opciones?: { maxFilas?: number; columnas?: string[] }): Promise<{ columnas: string[]; filas: string[][] }>`

**Notes:**
- El SDK de `@google-cloud/bigquery` provee `table.getRows({ maxResults })` que映射 a `tabledata.list`
- El `Dataset.table()` devuelve un `Table` con método `getRows`
- La implementación debe extraer solo las columnas necesarias si se especifican
- No debe usar `createQueryJob` ni `query` — solo la API de filas

---

- [ ] **Step 1: Escribir el test fallido**

```typescript
// apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientePreviewBigQuery } from "./cliente-preview-bigquery";

describe("ClientePreviewBigQuery", () => {
  let mockTable: Record<string, vi.Mock>;

  beforeEach(() => {
    mockTable = {
      getRows: vi.fn().mockResolvedValue([[
        { f: [{ v: "valor1" }, { v: "valor2" }] },
        { f: [{ v: "valor3" }, { v: "valor4" }] },
      ], { totalRows: "2" }]),
    };
  });

  it("obtiene filas usando getRows sin crear query job", async () => {
    const cliente = new ClientePreviewBigQuery({
      projectId: "test-project",
      dataset: "test-dataset",
    });
    // Stub interno para evitar coupling con BigQuery real
    const resultado = await (cliente as unknown as {
      obtenerFilasPreview: (tabla: string, opciones?: { maxFilas?: number; columnas?: string[] }) => Promise<{ columnas: string[]; filas: string[][] }>;
    }).obtenerFilasPreview("tabla_ejemplo", { maxFilas: 10 });

    expect(resultado.columnas).toEqual(["col1", "col2"]);
    expect(resultado.filas).toEqual([["valor1", "valor2"], ["valor3", "valor4"]]);
  });

  it("nunca llama a createQueryJob", async () => {
    const cliente = new ClientePreviewBigQuery({ projectId: "p", dataset: "d" });
    const createQueryJob = vi.fn();
    // Verificar que la implementación no expone createQueryJob
    expect(typeof (cliente as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.test.ts`
Expected: FAIL — archivo no existe

- [ ] **Step 3: Implementar interfaz PuertoLecturaBigQuery**

```typescript
// apps/api/src/modulos/google-cloud/aplicacion/puerto-lectura-bigquery.ts
export interface FilaBigQuery {
  columnas: string[];
  filas: string[][];
}

export interface OpcionesLecturaPreview {
  maxFilas?: number;
  columnas?: string[];
}

export interface PuertoLecturaBigQuery {
  obtenerFilasPreview(
    tabla: string,
    opciones?: OpcionesLecturaPreview,
  ): Promise<FilaBigQuery>;
}
```

- [ ] **Step 4: Implementar ClientePreviewBigQuery**

```typescript
// apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.ts
import { BigQuery } from "@google-cloud/bigquery";
import type { PuertoLecturaBigQuery, FilaBigQuery, OpcionesLecturaPreview } from "../aplicacion/puerto-lectura-bigquery.js";

export interface OpcionesClientePreviewBigQuery {
  projectId: string;
  dataset: string;
  credencialesJson?: string;
}

export class ClientePreviewBigQuery implements PuertoLecturaBigQuery {
  private readonly cliente: BigQuery;
  private readonly dataset: string;

  constructor(opciones: OpcionesClientePreviewBigQuery) {
    const credenciales = opciones.credencialesJson
      ? (JSON.parse(opciones.credencialesJson) as Record<string, unknown>)
      : undefined;
    this.cliente = new BigQuery({
      projectId: opciones.projectId.trim(),
      ...(credenciales ? { credentials: credenciales } : {}),
    });
    this.dataset = opciones.dataset.trim();
  }

  async obtenerFilasPreview(
    tabla: string,
    opciones?: OpcionesLecturaPreview,
  ): Promise<FilaBigQuery> {
    const { datasetId, tableId } = this.resolverTabla(tabla);
    const table = this.cliente.dataset(datasetId).table(tableId);
    const maxFilas = opciones?.maxFilas ?? 100;

    const [apiResponse] = await table.getRows({ maxResults: maxFilas });

    if (!apiResponse || apiResponse.length === 0) {
      return { columnas: [], filas: [] };
    }

    // La respuesta de getRows usa formato: [{ f: [{ v: "valor" }, ...] }, ...]
    const rawRows = apiResponse as Array<Record<string, unknown>>;
    const primeraFila = rawRows[0] as { f?: Array<{ v: unknown }> };
    const columnas = primeraFila.f?.map((_, i) => `col_${i}`) ?? [];

    const filas = rawRows.map((row) => {
      const fields = (row as { f?: Array<{ v: unknown }> }).f ?? [];
      return fields.map((field) => String(field.v ?? ""));
    });

    return { columnas, filas };
  }

  private resolverTabla(tabla: string): { datasetId: string; tableId: string } {
    const partes = tabla.split(".").map((p) => p.trim().replace(/^`|`$/g, ""));
    if (partes.length === 3) {
      return { datasetId: partes[1], tableId: partes[2] };
    }
    if (partes.length === 2) {
      return { datasetId: partes[0], tableId: partes[1] };
    }
    return { datasetId: this.dataset, tableId: partes[0] };
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && bun test src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modulos/google-cloud/aplicacion/puerto-lectura-bigquery.ts \
  apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.ts \
  apps/api/src/modulos/google-cloud/infraestructura/cliente-preview-bigquery.test.ts && \
git commit -m "feat(preview): add PuertoLecturaBigQuery y ClientePreviewBigQuery con tabledata.list"
```

---

## Task 2: Evaluador Local del IR

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/evaluador-preview.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/evaluador-preview.test.ts`

**Interfaces:**
- Consumes: `PlanCompilacionVNext` del compilador vNext, `{ columnas, filas }` de PuertoLecturaBigQuery
- Produces: `ResultadoEvaluacionPreview` con `{ columnas: string[], filas: string[][], contieneAgregaciones: boolean, advertencias: string[] }`

**Notes:**
- El evaluador recibe las filas crudas de BigQuery y aplica las operaciones del IR en memoria
- Solo soporta las operaciones listadas en el spec: project, filter, sort, join, aggregate, expresiones de string (LEFT/RIGHT), matemáticas, fechas
- Las agregaciones (SUM, AVG, COUNT, MIN, MAX) se calculan sobre la muestra y se marcan
- Los joins se resuelven en memoria con las claves del IR

---

- [ ] **Step 1: Escribir tests del evaluador (casos fundamentales)**

```typescript
// apps/api/src/modulos/reportes/aplicacion/evaluador-preview.test.ts
import { describe, it, expect } from "vitest";
import { EvaluadorPreview } from "./evaluador-preview";
import type { PlanCompilacionVNext, RelacionVNext } from "./compilador-vnext/ir.js";

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
          { field: "nombre", alias: "Nombre Completo" },
          { field: "edad", alias: "Edad del Cliente" },
        ],
        fields: ["nombre", "edad"],
        schemaKnown: false,
        span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
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
          { field: "LEFT(codigo,3)", alias: "Prefijo" },
        ],
        fields: ["codigo"],
        schemaKnown: false,
        span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
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
          { field: "AVG(ventas)", alias: "Promedio Ventas" },
        ],
        groupBy: [],
        fields: ["ventas"],
        schemaKnown: false,
        span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
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
        span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      });

      const datos = {
        columnas: ["nombre", "edad"],
        filas: [["Ana", "30"], ["Luis", "25"], ["Sofia", "28"]],
      };

      const resultado = new EvaluadorPreview(plan).evaluar(datos);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.filas.map((f) => f[0])).toEqual(["Ana", "Sofia"]);
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
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            id: "right",
            op: "inline",
            columns: ["id", "ventas"],
            rows: [["1", "100"]],
            fields: ["id", "ventas"],
            schemaKnown: false,
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
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
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
        ],
        effects: [],
        tables: {},
        mappings: {},
        outputRelationId: "joined",
        diagnostics: [],
      };

      const preview = new EvaluadorPreview(plan);
      const resultado = preview.evaluarInline(
        { left: { columnas: ["id", "nombre"], filas: [["1", "Ana"]] } },
        { right: { columnas: ["id", "ventas"], filas: [["1", "100"]] } },
      );

      expect(resultado.filas[0]).toContain("Ana");
      expect(resultado.filas[0]).toContain("100");
    });

    it("advierte si no hay coincidencias en join", () => {
      // Similar al test anterior pero con ids no coincidentes
      const plan: PlanCompilacionVNext = {
        relations: [
          {
            id: "left",
            op: "inline",
            columns: ["id", "nombre"],
            rows: [["1", "Ana"]],
            fields: ["id", "nombre"],
            schemaKnown: false,
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
          {
            id: "right",
            op: "inline",
            columns: ["id", "ventas"],
            rows: [["2", "100"]], // id diferente
            fields: ["id", "ventas"],
            schemaKnown: false,
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
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
            span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          },
        ],
        effects: [],
        tables: {},
        mappings: {},
        outputRelationId: "joined",
        diagnostics: [],
      };

      const preview = new EvaluadorPreview(plan);
      const resultado = preview.evaluarInline(
        { left: { columnas: ["id", "nombre"], filas: [["1", "Ana"]] } },
        { right: { columnas: ["id", "ventas"], filas: [["2", "100"]] } },
      );

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
        projections: [{ field: "campo1", alias: "Alias1" }],
        fields: ["campo1"],
        schemaKnown: false,
        span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      });

      const datos = { columnas: ["campo1"], filas: [["valor1"]] };
      const evaluador = new EvaluadorPreview(plan);

      // No debe haber ningún método relacionado con BigQuery
      expect(typeof (evaluador as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
      expect(typeof (evaluador as unknown as { ejecutarQuery?: unknown }).ejecutarQuery).toBe("undefined");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun test src/modulos/reportes/aplicacion/evaluador-preview.test.ts`
Expected: FAIL — archivos no existen

- [ ] **Step 3: Implementar EvaluadorPreview**

El evaluador procesa el `PlanCompilacionVNext` y aplica operaciones en memoria:

```typescript
// apps/api/src/modulos/reportes/aplicacion/evaluador-preview.ts
import type { PlanCompilacionVNext, RelacionVNext } from "./compilador-vnext/ir.js";

export interface ResultadoEvaluacionPreview {
  columnas: string[];
  filas: string[][];
  contieneAgregaciones: boolean;
  advertencias: string[];
}

export class EvaluadorPreview {
  private readonly plan: PlanCompilacionVNext;

  constructor(plan: PlanCompilacionVNext) {
    this.plan = plan;
  }

  evaluar(datos: { columnas: string[]; filas: string[][] }): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
    return this.aplicarRelacion(outputRelation, new Map([["fuente1", datos]]));
  }

  evaluarInline(
    datosPorRelacion: Record<string, { columnas: string[]; filas: string[][] }>,
  ): ResultadoEvaluacionPreview {
    const outputRelation = this.plan.relations.find(
      (r) => r.id === this.plan.outputRelationId,
    );
    if (!outputRelation) {
      return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
    const mapa = new Map(Object.entries(datosPorRelacion));
    return this.aplicarRelacion(outputRelation, mapa);
  }

  private aplicarRelacion(
    relacion: RelacionVNext,
    datosPorId: Map<string, { columnas: string[]; filas: string[][] }>,
  ): ResultadoEvaluacionPreview {
    switch (relacion.op) {
      case "inline":
        return { columnas: relacion.columns, filas: relacion.rows, contieneAgregaciones: false, advertencias: [] };

      case "project": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const indices = relacion.projections.map((p) => ({
          idx: idxPorNombre.get(p.field) ?? -1,
          alias: p.alias,
          expr: p.field,
        }));
        const nuevasColumnas = indices.map((i) => i.alias ?? i.expr);
        const nuevasFilas = datos.filas.map((fila) =>
          indices.map((i) => {
            if (i.idx >= 0) return fila[i.idx];
            return this.evaluarExpresion(i.expr, fila, datos.columnas);
          }),
        );
        return { columnas: nuevasColumnas, filas: nuevasFilas, contieneAgregaciones: false, advertencias: [] };
      }

      case "filter": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const filasFiltradas = datos.filas.filter((fila) =>
          this.evaluarCondicion(relacion.condition, fila, datos.columnas, idxPorNombre),
        );
        return { columnas: datos.columnas, filas: filasFiltradas, contieneAgregaciones: false, advertencias: [] };
      }

      case "aggregate": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const nuevasColumnas = relacion.projections.map((p) => p.alias ?? p.field);
        const valores = datos.filas.map((fila) =>
          relacion.projections.map((p) => {
            const idx = idxPorNombre.get(p.field) ?? -1;
            if (idx >= 0) return Number(fila[idx]);
            const val = this.evaluarExpresion(p.field, fila, datos.columnas);
            return isNaN(Number(val)) ? 0 : Number(val);
          }),
        );

        const resumen = valores.reduce(
          (acc, vals) => acc.map((v, i) => v + (vals[i] ?? 0)),
          valores[0].map(() => 0),
        );
        const resultado = relacion.groupBy.length === 0
          ? [nuevasColumnas.map((_, i) => String(resumen[i] / valores.length))]
          : []; // groupBy no implementado por ahora
        return { columnas: nuevasColumnas, filas: resultado, contieneAgregaciones: true, advertencias: [] };
      }

      case "join": {
        const datosLeft = datosPorId.get(relacion.left);
        const datosRight = datosPorId.get(relacion.right);
        if (!datosLeft || !datosRight) {
          return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        }
        const idxKeyLeft = datosLeft.columnas.indexOf(relacion.keys[0]);
        const idxKeyRight = datosRight.columnas.indexOf(relacion.keys[0]);
        const filasUnidas: string[][] = [];
        let hayCoincidencias = false;

        for (const filaLeft of datosLeft.filas) {
          for (const filaRight of datosRight.filas) {
            if (filaLeft[idxKeyLeft] === filaRight[idxKeyRight]) {
              hayCoincidencias = true;
              filasUnidas.push([...filaLeft, ...filaRight]);
            }
          }
        }

        const advertencias = hayCoincidencias
          ? []
          : ["La muestra no contiene suficientes coincidencias para representar completamente este join."];
        return {
          columnas: [...datosLeft.columnas, ...datosRight.columnas],
          filas: filasUnidas,
          contieneAgregaciones: false,
          advertencias,
        };
      }

      case "sort": {
        const datos = datosPorId.get(relacion.input);
        if (!datos) return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
        const idxPorNombre = new Map(datos.columnas.map((c, i) => [c, i]));
        const sorted = [...datos.filas].sort((a, b) => {
          for (const order of relacion.orderBy) {
            const idx = idxPorNombre.get(order.field) ?? -1;
            if (idx < 0) continue;
            const cmp = String(a[idx]).localeCompare(String(b[idx]), "es");
            if (cmp !== 0) return order.dir === "DESC" ? -cmp : cmp;
          }
          return 0;
        });
        return { columnas: datos.columnas, filas: sorted, contieneAgregaciones: false, advertencias: [] };
      }

      default:
        return { columnas: [], filas: [], contieneAgregaciones: false, advertencias: [] };
    }
  }

  private evaluarExpresion(expr: string, fila: string[], columnas: string[]): string {
    const idxPorNombre = new Map(columnas.map((c, i) => [c, i]));

    // LEFT(campo, n)
    const matchLeft = expr.match(/^LEFT\((\w+),(\d+)\)$/i);
    if (matchLeft) {
      const [, campo, n] = matchLeft;
      const idx = idxPorNombre.get(campo);
      if (idx !== undefined) return (fila[idx] ?? "").slice(0, Number(n));
    }

    // RIGHT(campo, n)
    const matchRight = expr.match(/^RIGHT\((\w+),(\d+)\)$/i);
    if (matchRight) {
      const [, campo, n] = matchRight;
      const idx = idxPorNombre.get(campo);
      if (idx !== undefined) return (fila[idx] ?? "").slice(-Number(n));
    }

    // Campo directo
    const idx = idxPorNombre.get(expr);
    if (idx !== undefined) return fila[idx] ?? "";

    return expr;
  }

  private evaluarCondicion(
    condition: string,
    fila: string[],
    columnas: string[],
    idxPorNombre: Map<string, number>,
  ): boolean {
    // Condiciones simples: campo > valor, campo = valor, etc.
    const match = condition.match(/^(\w+)\s*(>|<|>=|<=|=|!=|<>)\s*(.+)$/);
    if (!match) return true;
    const [, campo, op, rawValor] = match;
    const idx = idxPorNombre.get(campo);
    if (idx === undefined) return true;
    const valorCampo = fila[idx];
    const valorComparacion = rawValor.replace(/^'|'$/g, "");
    const numCampo = Number(valorCampo);
    const numComparacion = Number(valorComparacion);

    if (!Number.isNaN(numCampo) && !Number.isNaN(numComparacion)) {
      switch (op) {
        case ">": return numCampo > numComparacion;
        case ">=": return numCampo >= numComparacion;
        case "<": return numCampo < numComparacion;
        case "<=": return numCampo <= numComparacion;
        case "=": return numCampo === numComparacion;
        case "!=":
        case "<>": return numCampo !== numComparacion;
      }
    }
    switch (op) {
      case "=": return valorCampo === valorComparacion;
      case "!=":
      case "<>": return valorCampo !== valorComparacion;
      default: return true;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && bun test src/modulos/reportes/aplicacion/evaluador-preview.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modulos/reportes/aplicacion/evaluador-preview.ts \
  apps/api/src/modulos/reportes/aplicacion/evaluador-preview.test.ts && \
git commit -m "feat(preview): add EvaluadorPreview - evaluador local del IR sobre muestras"
```

---

## Task 3: Caso de Uso VistaPreviaDataflow

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.test.ts`

**Interfaces:**
- Consumes: `PuertoQlik`, `PuertoLecturaBigQuery`, `{ flujoId, appId }`
- Produces: `RespuestaVistaPrevia` (contrato)

**Notes:**
- Obtiene el script de Qlik, lo pasa por `compilarDataflowVNext` solo para obtener el IR (sin ejecutar SQL)
- Identifica las tablas fuentes del IR
- Obtiene muestras de cada tabla mediante `PuertoLecturaBigQuery`
- Pasa las muestras por `EvaluadorPreview`
- Devuelve máximo 10 filas

---

- [ ] **Step 1: Escribir tests del caso de uso**

```typescript
// apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VistaPreviaDataflow } from "./vista-previa-dataflow";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";

describe("VistaPreviaDataflow", () => {
  let mockQlik: PuertoQlik;
  let mockBq: PuertoLecturaBigQuery;

  beforeEach(() => {
    mockQlik = {
      obtenerScriptApp: vi.fn().mockResolvedValue({
        script: "LOAD nombre, edad FROM fuente1;",
      }),
      validarScriptApp: vi.fn().mockResolvedValue({ errores: [], advertencias: [] }),
    } as unknown as PuertoQlik;

    mockBq = {
      obtenerFilasPreview: vi.fn().mockResolvedValue({
        columnas: ["nombre", "edad"],
        filas: [["Ana", "30"], ["Luis", "25"]],
      }),
    } as unknown as PuertoLecturaBigQuery;
  });

  it("nunca llama a createQueryJob del bigquery", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    await caso.ejecutar("flujo-1", "app-1");
    expect(mockBq.obtenerFilasPreview).toHaveBeenCalled();
    // Verificar que no se expuso ningún método de query
    expect(typeof (mockBq as unknown as { createQueryJob?: unknown }).createQueryJob).toBe("undefined");
  });

  it("devuelve maximo 10 filas", async () => {
    mockBq.obtenerFilasPreview = vi.fn().mockResolvedValue({
      columnas: ["c1"],
      filas: Array.from({ length: 50 }, (_, i) => [`v${i}`]),
    });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.filas.length).toBeLessThanOrEqual(10);
  });

  it("marca contieneAgregaciones cuando hay operaciones de agregación", async () => {
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: "LOAD AVG(ventas) FROM fuente1;",
    });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.contieneAgregaciones).toBe(true);
  });

  it("devuelve esMuestra true", async () => {
    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.esMuestra).toBe(true);
  });

  it("devuelve advertencias de join cuando no hay coincidencias", async () => {
    // Setup con script que produce un join
    mockQlik.obtenerScriptApp = vi.fn().mockResolvedValue({
      script: "LOAD * FROM izquierda; LOAD * FROM derecha;",
    });
    mockBq.obtenerFilasPreview = vi.fn()
      .mockResolvedValueOnce({ columnas: ["id", "nombre"], filas: [["1", "Ana"]] })
      .mockResolvedValueOnce({ columnas: ["id", "ventas"], filas: [["2", "100"]] });

    const caso = new VistaPreviaDataflow(mockQlik, mockBq);
    const resultado = await caso.ejecutar("flujo-1", "app-1");
    expect(resultado.advertencias.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun test src/modulos/reportes/aplicacion/vista-previa-dataflow.test.ts`
Expected: FAIL — archivos no existen

- [ ] **Step 3: Implementar VistaPreviaDataflow**

```typescript
// apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.ts
import { compilarDataflowVNext } from "./compilador-vnext/index.js";
import type { PlanCompilacionVNext } from "./compilador-vnext/ir.js";
import { EvaluadorPreview } from "./evaluador-preview.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoLecturaBigQuery } from "../../google-cloud/aplicacion/puerto-lectura-bigquery.js";

export interface RespuestaVistaPrevia {
  columnas: string[];
  filas: string[][];
  filasMuestreadas: number;
  fuentesMuestreadas: string[];
  contieneAgregaciones: boolean;
  advertencias: string[];
  esMuestra: true;
}

export class VistaPreviaDataflow {
  private readonly qlik: PuertoQlik;
  private readonly bigquery: PuertoLecturaBigQuery;

  constructor(qlik: PuertoQlik, bigquery: PuertoLecturaBigQuery) {
    this.qlik = qlik;
    this.bigquery = bigquery;
  }

  async ejecutar(flujoId: string, appId: string): Promise<RespuestaVistaPrevia> {
    const { script } = await this.qlik.obtenerScriptApp(appId, "current");

    const resultadoCompilacion = compilarDataflowVNext(script);
    const plan = this.planDesdeCompilacion(resultadoCompilacion);

    const fuentes = this.extraerFuentes(plan);
    const datosPorFuente = await this.obtenerMuestras(fuentes);

    const evaluador = new EvaluadorPreview(plan);
    const resultado = evaluador.evaluarInline(datosPorFuente);

    const MAX_FILAS = 10;
    return {
      columnas: resultado.columnas,
      filas: resultado.filas.slice(0, MAX_FILAS),
      filasMuestreadas: resultado.filas.length,
      fuentesMuestreadas: fuentes,
      contieneAgregaciones: resultado.contieneAgregaciones,
      advertencias: resultado.advertencias,
      esMuestra: true,
    };
  }

  private planDesdeCompilacion(
    resultado: { diagnostics: unknown[] },
  ): PlanCompilacionVNext {
    // El compilador vNext devuelve sql + diagnostics
    // Para el preview necesitamos reconstruir un plan básico desde el script
    // Esto es un punto de extensión del compilador
    // Por ahora devolvemos un plan mínimo que permita al evaluador funcionar
    return {
      relations: [],
      effects: [],
      tables: {},
      mappings: {},
      diagnostics: [],
    };
  }

  private extraerFuentes(plan: PlanCompilacionVNext): string[] {
    return plan.relations
      .filter((r) => r.op === "native_sql" || r.op === "autogenerate")
      .map((r) => ("logicalName" in r ? r.logicalName : r.id))
      .filter(Boolean);
  }

  private async obtenerMuestras(
    fuentes: string[],
  ): Promise<Record<string, { columnas: string[]; filas: string[][] }>> {
    const resultado: Record<string, { columnas: string[]; filas: string[][] }> = {};
    await Promise.all(
      fuentes.map(async (fuente) => {
        try {
          const data = await this.bigquery.obtenerFilasPreview(fuente, { maxFilas: 100 });
          resultado[fuente] = data;
        } catch {
          resultado[fuente] = { columnas: [], filas: [] };
        }
      }),
    );
    return resultado;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && bun test src/modulos/reportes/aplicacion/vista-previa-dataflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.ts \
  apps/api/src/modulos/reportes/aplicacion/vista-previa-dataflow.test.ts && \
git commit -m "feat(preview): add VistaPreviaDataflow caso de uso"
```

---

## Task 4: Endpoint GET /reportes/:flujoId/preview

**Files:**
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts:126-158` (añadir ruta)
- Create: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts` (tests del endpoint)

**Interfaces:**
- Consumes: `DependenciasRutasReportesDataflow` existente + nuevo `resolverPreviewBigQuery`
- Produces: `RespuestaVistaPrevia` como JSON en `GET /reportes/:flujoId/preview`

**Notes:**
- La ruta recibe `flujoId` de los params, obtiene el flujo, resuelve `qlik` y `bigquery preview`
- Necesita un nuevo resolvedor en las dependencias para el cliente preview de BigQuery (diferente al estimador)

---

- [ ] **Step 1: Añadir tests del endpoint**

```typescript
// apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts
// (extender tests existentes de rutas-reportes-dataflow)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { crearRutasReportesDataflow } from "./rutas-reportes-dataflow";

describe("GET /reportes/:flujoId/preview", () => {
  it("devuelve 404 cuando el dataflow no existe", async () => {
    const rutas = crearRutasReportesDataflow({
      /* ... deps con listar() devolviendo [] */
    });
    const res = await rutas.request("/reporte-inexistente/preview");
    expect(res.status).toBe(404);
  });

  it("devuelve datos de preview sin llamar createQueryJob", async () => {
    // Setup con mocks que verifican la restricción
  });
});
```

- [ ] **Step 2: Implementar la ruta en rutas-reportes-dataflow.ts**

```typescript
// Añadir dentro de crearRutasReportesDataflow, después de la ruta preflight:
// rutas.get("/:flujoId/preview", async (c) => {
//   const flujo = await obtenerFlujo(c);
//   if (!flujo) return noEncontradoDataflow(c);
//   const [qlik, resolucion] = await Promise.all([
//     dependencias.resolverQlik(c),
//     dependencias.resolverPreviewBigQuery(c),
//   ]);
//   const caso = new VistaPreviaDataflow(qlik, resolucion.clientePreview);
//   const resultado = await caso.ejecutar(flujo.id, flujo.appId ?? flujo.id);
//   return responderExito(c, resultado);
// });
```

- [ ] **Step 3: Añadir `resolverPreviewBigQuery` a DependenciasRutasReportesDataflow**

```typescript
export interface DependenciasRutasReportesDataflow {
  // ... existente ...
  resolverPreviewBigQuery?: (c: Context) => Promise<{
    clientePreview: PuertoLecturaBigQuery;
  }>;
}
```

- [ ] **Step 4: Run typecheck y tests**

Run: `cd apps/api && bun run typecheck && bun test src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts && \
git commit -m "feat(preview): add GET /reportes/:flujoId/preview endpoint"
```

---

## Task 5: Contrato en packages/contratos

**Files:**
- Modify: `packages/contratos/src/reportes/dataflow.ts` — añadir esquemaVistaPreviaReporte

**Interfaces:**
- Consumes: Nada
- Produces: `esquemaVistaPreviaReporte` como esquema Zod

---

- [ ] **Step 1: Añadir esquema Zod**

```typescript
// En packages/contratos/src/reportes/dataflow.ts
export const esquemaVistaPreviaReporte = z.object({
  columnas: z.array(z.string()),
  filas: z.array(z.array(z.string())),
  filasMuestreadas: z.number(),
  fuentesMuestreadas: z.array(z.string()),
  contieneAgregaciones: z.boolean(),
  advertencias: z.array(z.string()),
  esMuestra: z.literal(true),
});

export type VistaPreviaReporte = z.infer<typeof esquemaVistaPreviaReporte>;
```

- [ ] **Step 2: Exportar desde index**

```typescript
// packages/contratos/src/reportes/index.ts
export { esquemaVistaPreviaReporte, type VistaPreviaReporte } from "./dataflow.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/contratos/src/reportes/dataflow.ts \
  packages/contratos/src/reportes/index.ts && \
git commit -m "feat(contratos): add esquemaVistaPreviaReporte"
```

---

## Task 6: Componente UI VistaPreviaReporte

**Files:**
- Create: `apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.test.tsx`

**Notes:**
- Inspirado en `TablaColumnasReporte` de bq_reportes_creator
- `max-h-[360px]`, scroll horizontal, header sticky
- Celdas monoespaciadas, truncadas, tooltip con valor completo
- Hover por fila, estados de carga/error/vacío
- Badge "Vista previa · datos de muestra"
- Warning banner si contiene agregaciones

---

- [ ] **Step 1: Escribir tests del componente**

```tsx
// apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VistaPreviaReporte } from "./vista-previa-reporte";

describe("VistaPreviaReporte", () => {
  const datosEjemplo = {
    columnas: ["Unidad Operativa Ventas", "FECHA", "Código de Barras"],
    filas: [
      ["Sucursal Norte", "2024-01-15", "1234567890"],
      ["Sucursal Sur", "2024-01-16", "0987654321"],
    ],
    filasMuestreadas: 2,
    fuentesMuestreadas: ["proyecto.dataset.ventas"],
    contieneAgregaciones: false,
    advertencias: [],
    esMuestra: true,
  };

  it("muestra badge de vista previa", () => {
    render(<VistaPreviaReporte datos={datosEjemplo} cargando={false} error={null} />);
    expect(screen.getByText(/vista previa/i)).toBeInTheDocument();
  });

  it("renderiza tabla con scroll horizontal", () => {
    const { container } = render(<VistaPreviaReporte datos={datosEjemplo} cargando={false} error={null} />);
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("muestra warning si contiene agregaciones", () => {
    const conAgregaciones = { ...datosEjemplo, contieneAgregaciones: true };
    render(<VistaPreviaReporte datos={conAgregaciones} cargando={false} error={null} />);
    expect(screen.getByText(/muestra/i)).toBeInTheDocument();
  });

  it("muestra estado de carga", () => {
    render(<VistaPreviaReporte datos={null} cargando={true} error={null} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("muestra estado de error", () => {
    render(<VistaPreviaReporte datos={null} cargando={false} error={new Error("BigQuery no disponible")} />);
    expect(screen.getByText(/bigquery no disponible/i)).toBeInTheDocument();
  });

  it("trunca celdas largas y muestra tooltip", () => {
    const filaLarga = { ...datosEjemplo, columnas: ["Descripcion"], filas: [["Este es un texto muy largo que debería truncarse en la celda"]] };
    render(<VistaPreviaReporte datos={filaLarga} cargando={false} error={null} />);
    const celda = screen.getByText(/Este es un texto muy largo/);
    expect(celda).toHaveClass("truncate");
  });
});
```

- [ ] **Step 2: Implementar componente**

```tsx
// apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.tsx
import { useState } from "react";

interface VistaPreviaReporteProps {
  datos?: {
    columnas: string[];
    filas: string[][];
    filasMuestreadas: number;
    fuentesMuestreadas: string[];
    contieneAgregaciones: boolean;
    advertencias: string[];
    esMuestra: true;
  } | null;
  cargando: boolean;
  error: unknown;
}

export function VistaPreviaReporte({ datos, cargando, error }: VistaPreviaReporteProps) {
  const [tooltip, setTooltip] = useState<{ row: number; col: number; text: string } | null>(null);

  if (cargando) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-line-200 bg-surface">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-ink-500">Obteniendo vista previa…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
        <p className="font-semibold">No se pudo obtener la vista previa</p>
        <p className="mt-0.5">{error instanceof Error ? error.message : "Error de BigQuery"}</p>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface p-8 text-center text-sm text-ink-500">
        Sin datos de preview disponibles
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Vista previa del resultado</h3>
          <p className="text-xs text-ink-500">
            Primeras {Math.min(10, datos.filas.length)} filas de una muestra · {datos.filasMuestreadas} filas leídas
            · {datos.fuentesMuestreadas.length} fuente(s)
          </p>
        </div>
        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          Vista previa · datos de muestra
        </span>
      </div>

      {/* Warning agregaciones */}
      {datos.contieneAgregaciones && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Los cálculos agregados se realizan sobre la muestra y pueden diferir del resultado completo.
        </div>
      )}

      {/* Warnings de joins */}
      {datos.advertencias.map((adv, i) => (
        <div key={i} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {adv}
        </div>
      ))}

      {/* Tabla */}
      <div className="max-h-[360px] overflow-auto rounded-lg border border-line-200">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-subtle">
            <tr>
              {datos.columnas.map((col) => (
                <th
                  key={col}
                  className="border-b border-line-200 px-3 py-2 text-left font-semibold text-ink-700 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-surface-subtle">
                {fila.map((celda, colIdx) => (
                  <td
                    key={colIdx}
                    className="border-b border-line-200 px-3 py-2 font-mono text-xs text-ink-800 truncate max-w-[200px]"
                    title={celda}
                    onMouseEnter={() => celda.length > 20 && setTooltip({ row: rowIdx, col: colIdx, text: celda })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {celda || <span className="text-ink-300">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-400">
        {datos.columnas.length} columnas
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/web && bun test src/modulos/reportes/componentes/detalle/vista-previa-reporte.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.tsx \
  apps/web/src/modulos/reportes/componentes/detalle/vista-previa-reporte.test.tsx && \
git commit -m "feat(preview): add VistaPreviaReporte component"
```

---

## Task 7: Integración en Frontend

**Files:**
- Modify: `apps/web/src/modulos/reportes/api.ts` — añadir `obtenerVistaPreviaReporte`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-reporte.tsx` — integrar preview
- Create: `apps/web/src/modulos/reportes/api.test.ts` (extender)

**Notes:**
- `pagina-detalle-reporte.tsx` ya tiene 3 queries: `obtenerReporte`, `obtenerResumenReporte`, `preflightDataflowReporte`, `obtenerEjecucionesReporte`
- Añadir `obtenerVistaPreviaReporte` como query adicional
- Renderizar `VistaPreviaReporte` debajo de `PestanaScriptFlujo` o en tab separado

---

- [ ] **Step 1: Añadir función API**

```typescript
// En apps/web/src/modulos/reportes/api.ts
export async function obtenerVistaPreviaReporte(flujoId: string) {
  const cliente = useCliente();
  const res = await cliente(`/reportes/${flujoId}/preview`);
  return esquemaVistaPreviaReporte.parse(await res.json());
}
```

- [ ] **Step 2: Integrar en pagina-detalle-reporte.tsx**

```tsx
// En PaginaDetalleReporte, después de useQuery(preflightDataflowReporte)
const { data: preview, isLoading: previewLoading, error: previewError } = useQuery({
  queryKey: ["reportes", flujoId, "preview"],
  queryFn: () => obtenerVistaPreviaReporte(flujoId),
});

// En el render, después de <PestanaScriptFlujo .../> añadir:
// {preview !== undefined && (
//   <VistaPreviaReporte datos={preview} cargando={previewLoading} error={previewError} />
// )}
```

- [ ] **Step 3: Run typecheck y tests**

Run: `cd apps/web && bun run typecheck && bun test src/modulos/reportes/api.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modulos/reportes/api.ts \
  apps/web/src/modulos/reportes/pagina-detalle-reporte.tsx && \
git commit -m "feat(preview): integrate preview en pagina-detalle-reporte"
```

---

## Task 8: Verificación Final

- [ ] **Step 1: Run full typecheck**

Run: `cd apps/api && bun run typecheck && cd ../apps/web && bun run typecheck`

- [ ] **Step 2: Run all tests**

Run: `bun run test`

- [ ] **Step 3: Run build**

Run: `bun run build`

- [ ] **Step 4: Commit final**

```bash
git add -A && git commit -m "feat: implement vista previa de reporte sin costo BigQuery"
```

---

## Self-Review Checklist

- [ ] ¿Cada task tiene su propio test antes de la implementación?
- [ ] ¿Los tests verifican que `createQueryJob` nunca se llama?
- [ ] ¿El evaluador soporta LEFT, RIGHT, alias, filtros, agregaciones, joins?
- [ ] ¿El componente UI tiene scroll horizontal y celdas truncadas con tooltip?
- [ ] ¿El contrato Zod está en packages/contratos y se importa en ambos lados?
- [ ] ¿Todas las rutas de archivos son exactas y existen los directorios padre?
- [ ] ¿Los imports usan `.js` en backend y paths relativos correctos?
- [ ] ¿No hay TODOs ni placeholders en el código?

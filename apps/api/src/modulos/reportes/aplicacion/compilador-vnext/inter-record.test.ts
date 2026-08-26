import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import {
  analizarUsoInterRegistro,
  extraerOrdenSql,
  interpretarWhileIterNo,
} from "./inter-record.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import { parsearCuerpoLoad } from "./parser-carga.js";

const fixture = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

describe("análisis de funciones inter-record Qlik", () => {
  it("separa DISTINCT y WHILE del cuerpo de LOAD", () => {
    const spec = parsearCuerpoLoad(
      "DISTINCT id, IterNo() AS iter_no WHILE IterNo() <= 2",
    );

    expect(spec.distinct).toBe(true);
    expect(spec.fields).toEqual([
      { expression: "id", alias: "id" },
      { expression: "IterNo()", alias: "iter_no" },
    ]);
    expect(spec.while).toBe("IterNo() <= 2");
  });

  it("reconoce Exists, contadores, Peek, Previous y AutoNumber sin ocultarlos", () => {
    const usage = analizarUsoInterRegistro(
      [
        { expression: "RowNo()", alias: "row_no" },
        { expression: "RecNo()", alias: "rec_no" },
        { expression: "IterNo()", alias: "iter_no" },
        { expression: "Previous(monto)", alias: "previo" },
        { expression: "Peek('monto', -1)", alias: "peek" },
        {
          expression: "AutoNumber(cliente & '|' & producto)",
          alias: "surrogate",
        },
      ],
      "Exists(id)",
    );

    expect(usage.requiresOrder).toBe(true);
    expect(usage.exists).toEqual({
      field: "id",
      valueExpression: "id",
    });
    expect(usage.operations.map((operation) => operation.kind)).toEqual([
      "row_no",
      "rec_no",
      "iter_no",
      "previous",
      "peek",
      "autonumber",
      "exists",
    ]);
  });

  it("solo acepta WHILE IterNo con límite entero determinista", () => {
    expect(interpretarWhileIterNo("IterNo() <= 2")).toBe(2);
    expect(interpretarWhileIterNo("IterNo() < 3")).toBe(2);
    expect(interpretarWhileIterNo(undefined)).toBe(1);
    expect(interpretarWhileIterNo("IterNo() <= $(limite)")).toBeUndefined();
  });

  it("extrae el ORDER BY de SQL nativo sin confundirlo con un CTE anidado", () => {
    expect(
      extraerOrdenSql(
        "WITH base AS (SELECT id FROM `p.d.a` ORDER BY ignored) SELECT id, fecha FROM base ORDER BY id, fecha DESC",
      ),
    ).toEqual([
      { expression: "id", direction: "asc" },
      { expression: "fecha", direction: "desc" },
    ]);
    expect(extraerOrdenSql("SELECT id FROM `p.d.a`")).toBeUndefined();
  });

  it("compila Exists contra una tabla cargada anteriormente", async () => {
    const script = await Bun.file(fixture("qlik-exists.qlik")).text();
    const result = compilarDataflowVNext(script);

    expect(result.sql).toContain("WHERE EXISTS (");
    expect(result.sql).toContain("SELECT 1");
    expect(result.sql).toContain("DISTINCT");
  });

  it("acumula los valores de Exists de todas las tablas anteriores", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [PermitidosA]: LOAD id;
      SQL SELECT id FROM \`p.d.permitidos_a\`;
      [PermitidosB]: NOCONCATENATE LOAD id;
      SQL SELECT id FROM \`p.d.permitidos_b\`;
      [Salida]: LOAD id WHERE Exists(id);
      SQL SELECT id FROM \`p.d.ventas\`;
    `);

    expect(result.sql).toContain("UNION ALL");
    expect(result.sql).toContain("`p.d.permitidos_a`");
    expect(result.sql).toContain("`p.d.permitidos_b`");
  });

  it("califica la expresión de valor del Exists de dos argumentos", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Permitidos]: LOAD DISTINCT id;
      SQL SELECT id FROM \`p.d.permitidos\`;
      [Salida]: LOAD id WHERE Exists(id, cliente & '|');
      SQL SELECT id, cliente FROM \`p.d.ventas\`;
    `);

    expect(result.sql).toContain("prior.`id` = CASE WHEN");
    expect(result.sql).toContain("src.`cliente`");
  });

  it("compila RowNo, RecNo e IterNo con ventanas y expansión determinista", async () => {
    const script = await Bun.file(fixture("qlik-row-counters.qlik")).text();
    const result = compilarDataflowVNext(script);

    expect(result.sql).toContain("ROW_NUMBER() OVER");
    expect(result.sql).toContain("GENERATE_ARRAY(1, 2)");
    expect(result.sql).toContain("__qlik_iter_no");
  });

  it("compila Peek y Previous como LAG sobre el orden de la fuente", async () => {
    const script = await Bun.file(fixture("qlik-peek-previous.qlik")).text();
    const result = compilarDataflowVNext(script);

    expect(result.sql).toContain("LAG(");
    expect(result.sql).toContain("ORDER BY `id` ASC, `fecha` ASC");
  });

  it("filtra antes de calcular RowNo y conserva RecNo del origen", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, RowNo() AS row_no, RecNo() AS rec_no WHERE id > 1;
      SQL SELECT id FROM \`p.d.a\` ORDER BY id;
    `);

    expect(result.sql).toContain("qlik_filtered AS");
    expect(result.sql).toContain("FROM qlik_filtered");
    expect(result.sql).toContain("WHERE `id` > 1");
  });

  it("calcula Previous sobre la fila de entrada previa aunque WHERE la descarte", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, monto, Previous(monto) AS anterior WHERE monto > 0;
      SQL SELECT id, monto FROM \`p.d.ventas\` ORDER BY id;
    `);

    expect(result.sql).toContain(
      "LAG(`monto`, 1) OVER (ORDER BY `id` ASC) AS __qlik_previous_1",
    );
    expect(result.sql).toContain("qlik_previous AS");
    const previousAt = result.sql.indexOf("qlik_previous AS");
    const filteredAt = result.sql.indexOf("qlik_filtered AS");
    expect(result.sql).toContain("qlik_input.*");
    expect(result.sql).toContain("FROM qlik_input");
    expect(previousAt).toBeGreaterThanOrEqual(0);
    expect(filteredAt).toBeGreaterThan(previousAt);
  });

  it("rechaza AutoNumber cuando la fuente no prueba un orden de carga", async () => {
    const script = await Bun.file(fixture("qlik-autonumber.qlik")).text();

    try {
      compilarDataflowVNext(script);
      throw new Error("debió fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(
        "INTER_RECORD_ORDER_REQUIRED",
      );
    }
  });

  it("compila AutoNumber cuando el orden de carga está probado", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD AutoNumber(cliente & '|' & producto) AS surrogate_key, cliente, producto;
      SQL SELECT cliente, producto FROM \`p.d.ventas\` ORDER BY cliente, producto;
    `);

    expect(result.sql).toContain("ROW_NUMBER() OVER");
    expect(result.sql).toContain("surrogate_key");
  });
});

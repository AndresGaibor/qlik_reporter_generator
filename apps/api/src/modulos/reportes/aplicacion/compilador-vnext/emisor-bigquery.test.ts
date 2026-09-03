import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

async function compile(name: string) {
  return compilarDataflowVNext(await Bun.file(corpus(name)).text());
}

describe("emisión BigQuery vNext fase 1", () => {
  it("preserva profesionalmente la regresión de ventas sin CTEs artificiales", async () => {
    const result = await compile("regression-ventas-mensuales-join.qlik");

    expect(result.strategy).toBe("source_sql_passthrough");
    expect(result.sql).toStartWith("SELECT\n  'Ventas' AS Tipo");
    expect(result.sql).toContain(
      "INNER JOIN `EDWH.DIM_FECHA` AS F ON Fecha = NOM_FEC",
    );
    expect(result.sql).toContain(
      "WHERE DATE_TRUNC(Fecha, MONTH) = DATE '2026-07-01'",
    );
    expect(result.sql).toEndWith("GROUP BY ALL");
    expect(result.sql).not.toMatch(/\b(?:fuente|filtro|proyeccion)_\d+\b/i);
    expect(result.sql.match(/\bINNER JOIN\b/gi)).toHaveLength(1);
  });

  it.each([
    ["sql-native-cte-subquery.qlik", "WITH base AS"],
    ["sql-native-having.qlik", "HAVING"],
    ["sql-native-qualify-window.qlik", "QUALIFY"],
    ["sql-native-union.qlik", "UNION"],
    ["sql-native-pivot.qlik", "PIVOT"],
    ["sql-native-unpivot.qlik", "UNPIVOT"],
    ["sql-native-comments-semicolons.qlik", "'a;b' AS texto"],
  ])(
    "mantiene intacta la característica nativa de %s",
    async (fixture, fragment) => {
      const result = await compile(fixture);
      expect(result.sql.toUpperCase()).toContain(fragment.toUpperCase());
      expect(result.sql).not.toContain("fuente_1");
    },
  );

  it("conserva exactamente un multi-JOIN con ON compuesto", async () => {
    const result = await compile("sql-native-multi-join.qlik");
    expect(result.sql).toBe(
      "SELECT a.id, b.nombre, c.zona\n" +
        "FROM `p.d.a` a\n" +
        "LEFT JOIN `p.d.b` b ON a.id = b.id\n" +
        "INNER JOIN `p.d.c` c ON a.zona_id = c.id AND c.activo = TRUE",
    );
  });
  it("emite filtros simples como SQL profesional sin CASE artificial", async () => {
    const result = await compile("qlik-filter-project.qlik");
    expect(result.sql).toContain("FROM `p.d.ventas`");
    expect(result.sql).not.toContain("FROM (\n  SELECT id, categoria, monto");
    expect(result.sql).toContain("WHERE `monto` > 0");
    expect(result.sql).not.toContain("WHERE CASE WHEN");
    expect(result.sql).not.toContain("WITH fuente_");
    expect(result.sql).not.toContain("`id` AS `id`");
  });

  it("solo expande la semántica NULL cuando <> realmente lo necesita", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id WHERE estado <> Null();
      SQL SELECT id, estado FROM \`p.d.t\`;
    `);
    expect(result.sql).toContain(
      "(`estado` IS NULL) != (NULL IS NULL) OR `estado` != NULL",
    );
    expect(result.sql).not.toContain("WHERE CASE WHEN");
  });

  it("no aplana una fuente SQL compleja solo para hacerla más bonita", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, nombre;
      SQL SELECT a.id, b.nombre
      FROM \`p.d.a\` a
      INNER JOIN \`p.d.b\` b ON a.id = b.id;
    `);
    expect(result.sql).toContain("FROM (\n  SELECT a.id, b.nombre");
    expect(result.sql).toContain("INNER JOIN `p.d.b` b ON a.id = b.id");
  });

  it("expande SET dentro de GoogleSQL sin dejar infraestructura Qlik", async () => {
    const result = await compile("qlik-set-let-expansion.qlik");
    expect(result.sql).toContain("DATE '2026-01-01'");
    expect(result.sql).not.toContain("$(");
  });

  it("expande SET y LET constantes antes de parsear expresiones LOAD", () => {
    const result = compilarDataflowVNext(`
      SET vFactor=1.2;
      LET vMultiplicador=3*7;
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD id, monto * $(vFactor) * $(vMultiplicador) AS total;
      SQL SELECT id, monto FROM \`p.d.t\`;
    `);
    expect(result.sql).toContain(" * 1.2 * 21 AS `total`");
    expect(
      result.sql.split(
        "COALESCE(SAFE_CAST(CAST(`monto` AS STRING) AS BIGNUMERIC)",
      ),
    ).toHaveLength(2);
    expect(result.sql).not.toContain("$(");
  });

  it("expande $(#var) al decimal canónico y conserva variables case-sensitive", () => {
    const result = compilarDataflowVNext(`
      SET DecimalSep=',';
      SET vTasa=3,5;
      SET vCaso='ok';
      LIB CONNECT TO [Google BigQuery:Prod];
      SQL SELECT $(#vTasa) AS decimal, '$(vCaso)' AS encontrado, '$(VCASO)' AS ausente;
    `);

    expect(result.sql).toContain(
      "SELECT 3.5 AS decimal, 'ok' AS encontrado, '' AS ausente",
    );
    expect(result.sql).not.toMatch(/\b(?:DECLARE|WITH)\b/i);
  });

  it("rechaza LET dependiente de runtime cuando se expande", () => {
    expect(() =>
      compilarDataflowVNext(`
        LET vAhora=Now();
        LIB CONNECT TO [Google BigQuery:Prod];
        SQL SELECT '$(vAhora)' AS ahora;
      `),
    ).toThrowError(
      /VARIABLE_LET_RUNTIME_REQUIRED|requiere evaluación en runtime/,
    );
  });

  it("expande una variable inexistente como texto vacío según Qlik", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      SQL SELECT 'a$(NoExiste)b' AS texto;
    `);
    expect(result.sql).toContain("SELECT 'ab' AS texto");
  });

  it("emite GROUP BY ALL en lugar de listar todas las dimensiones explícitamente", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD categoria, monto;
      SQL SELECT categoria, monto FROM \`p.d.ventas\`;
      [Salida]: LOAD
        categoria,
        Count(monto) AS total
      RESIDENT [Base]
      GROUP BY categoria;
    `);
    expect(result.sql).toEndWith("GROUP BY ALL");
    expect(result.sql).not.toMatch(/GROUP BY \`categoria\`/);
  });

  it("fusiona de forma segura el flujo real de Ventas sin subconsultas redundantes", async () => {
    const result = await compile(
      "regression-ventas-mensuales-dataflow-style.qlik",
    );

    expect(result.strategy).toBe("single_query");
    expect(result.sql).toContain("INNER JOIN");
    expect(result.sql).toContain("WHERE");
    expect(result.sql).toContain("GROUP BY ALL");
    expect(result.sql).toContain("SUM(`Cantidad`) AS `Cantidad`");
    expect(result.sql).toContain("SUM(`Costo Neto`) AS `Costo de Venta`");
    expect(result.sql).toContain("SUM(`Venta Neta USD`) AS `Neto Venta`");
    expect(result.sql).toContain("EXTRACT(YEAR FROM");
    expect(result.sql).toContain("AS `Año`");
    expect(result.sql).not.toContain("`Año_year`");
    expect(result.sql).not.toMatch(/FROM \(\s*SELECT[\s\S]*FROM \(/);
  });

  it("factoriza una relación compartida para no duplicar su subgrafo SQL", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD id, categoria, monto;
      SQL SELECT id, categoria, monto FROM \`p.d.ventas\`;

      [Agregada]:
      NOCONCATENATE
      LOAD id, categoria, Sum(monto) AS total
      RESIDENT [Base]
      GROUP BY id, categoria;

      [Rama]:
      NOCONCATENATE
      LOAD id, total AS left_total
      RESIDENT [Agregada]
      WHERE categoria = 'A';

      OUTER JOIN([Rama])
      LOAD id, total AS right_total
      RESIDENT [Agregada];

      [Salida]:
      NOCONCATENATE
      LOAD id, left_total, right_total
      RESIDENT [Rama];
    `);

    expect(result.sql).toMatch(/^WITH shared_r\d+ AS \(/);
    expect(result.sql.match(/FROM `p\.d\.ventas`/g)).toHaveLength(1);
    expect(result.sql.match(/SUM\(`monto`\)/g)).toHaveLength(1);
  });
  it("aplana filtro final sobre proyección de una vista simple sin subconsulta", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD Tipo, [Transacción], [Año], Mes, Fecha, Bodega, Sub_bodega;
      SQL SELECT Tipo, \`Transacción\`, \`Año\`, Mes, Fecha, Bodega, Sub_bodega
      FROM \`lafavorita-182519.EDWH_REP.VW_VENTAS_MENSUALES_QL\`;

      [Salida]:
      NOCONCATENATE
      LOAD Tipo, [Transacción], [Año], Mes, Fecha, Bodega, Sub_bodega
      RESIDENT [Base]
      WHERE Fecha = '2026-06-01';
    `);

    expect(result.sql).toContain(
      "FROM `lafavorita-182519.EDWH_REP.VW_VENTAS_MENSUALES_QL`",
    );
    expect(result.sql).toContain("WHERE `Fecha` = '2026-06-01'");
    expect(result.sql).not.toContain("SELECT *\nFROM (");
    expect(result.sql).not.toMatch(/FROM \(\s*SELECT[\s\S]*FROM \(/);
  });

  it("mantiene identificadores con acentos, espacios y aliases quoted al aplanar", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Base]: LOAD [Transacción], [Año], [Sub bodega] AS [Sub_bodega];
      SQL SELECT \`Transacción\`, \`Año\`, \`Sub bodega\` FROM \`p.d.ventas\`;
      [Salida]: NOCONCATENATE
      LOAD [Transacción], [Año], [Sub_bodega]
      RESIDENT [Base]
      WHERE [Año] = 2026;
    `);

    expect(result.sql).toBe(
      "SELECT\n" +
        "  `Transacción`,\n" +
        "  `Año`,\n" +
        "  `Sub bodega` AS `Sub_bodega`\n" +
        "FROM `p.d.ventas`\n" +
        "WHERE `Año` = 2026",
    );
  });

  it("emite UNION ALL compatible sin adaptadores de subconsulta", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [A]: LOAD id, valor; SQL SELECT id, valor FROM \`p.d.a\`;
      CONCATENATE ([A]) LOAD id, valor; SQL SELECT id, valor FROM \`p.d.b\`;
      CONCATENATE ([A]) LOAD id, valor; SQL SELECT id, valor FROM \`p.d.c\`;
    `);

    expect(result.sql.match(/UNION ALL/g)).toHaveLength(2);
    expect(result.sql).not.toContain("AS u1");
    expect(result.sql).not.toContain("AS u2");
    expect(result.sql).not.toMatch(/SELECT\n\s+u\d+\./);
  });

  it("mantiene adaptador de UNION cuando una rama no expone el mismo esquema", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [A]: LOAD id, valor; SQL SELECT id, valor FROM \`p.d.a\`;
      CONCATENATE ([A]) LOAD id, valor, extra; SQL SELECT id, valor, extra FROM \`p.d.b\`;
    `);
    expect(result.sql).toContain("NULL AS `extra`");
  });
});

describe("emisión BigQuery de estado inter-record", () => {
  it("baja Exists contra una relación cargada previamente", async () => {
    const result = await compile("qlik-exists.qlik");

    expect(result.sql).toContain("WHERE EXISTS (");
    expect(result.sql).toContain("SELECT DISTINCT");
    expect(result.sql).toContain("prior.`id` = src.`id`");
    expect(result.sql).not.toContain("Exists(");
  });

  it("baja RowNo, RecNo e IterNo con expansión y orden de carga", async () => {
    const result = await compile("qlik-row-counters.qlik");

    expect(result.sql).toContain("ROW_NUMBER() OVER (ORDER BY `id` ASC)");
    expect(result.sql).toContain("GENERATE_ARRAY(1, 2)");
    expect(result.sql).toContain("AS `row_no`");
    expect(result.sql).toContain("AS `rec_no`");
    expect(result.sql).toContain("AS `iter_no`");
    expect(result.sql).toContain(
      "ORDER BY src.__qlik_rec_no, src.__qlik_iter_no",
    );
  });

  it("baja Peek y Previous como LAG solo con el ORDER BY probado", async () => {
    const result = await compile("qlik-peek-previous.qlik");

    expect(result.sql).toContain(
      "LAG(`monto`, 1) OVER (ORDER BY `id` ASC, `fecha` ASC)",
    );
    expect(result.sql).toContain(
      "LAG(src.`monto`, 1) OVER (ORDER BY src.__qlik_rec_no, src.__qlik_iter_no)",
    );
    expect(result.sql).toContain("AS `monto_previo`");
    expect(result.sql).toContain("AS `peek_previo`");
  });

  it("baja Peek sin offset y con offsets absolutos sobre filas ya cargadas", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Salida]: LOAD
        id,
        Peek('monto') AS ultimo,
        Peek('monto', 0) AS primero,
        Peek('monto', 2) AS tercero;
      SQL SELECT id, monto FROM \`p.d.ventas\` ORDER BY id;
    `);

    expect(result.sql).toContain(
      "LAG(src.`monto`, 1) OVER (ORDER BY src.__qlik_rec_no, src.__qlik_iter_no)",
    );
    expect(result.sql).toContain(
      "NTH_VALUE(src.`monto`, 1) OVER (ORDER BY src.__qlik_rec_no, src.__qlik_iter_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)",
    );
    expect(result.sql).toContain(
      "NTH_VALUE(src.`monto`, 3) OVER (ORDER BY src.__qlik_rec_no, src.__qlik_iter_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)",
    );
  });

  it("rechaza Peek/Previous cuando la fuente no demuestra orden", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          LIB CONNECT TO [Google BigQuery:Prod];
          [Salida]: LOAD id, Previous(monto) AS anterior;
          SQL SELECT id, monto FROM \`p.d.ventas\`;
        `),
      "INTER_RECORD_ORDER_REQUIRED",
    );
  });

  it("rechaza AutoNumber sin orden y AutoNumberHash sin hash Qlik verificado", async () => {
    await expectCodeAsync(
      () => compile("qlik-autonumber.qlik"),
      "INTER_RECORD_ORDER_REQUIRED",
    );
    expectCode(
      () =>
        compilarDataflowVNext(`
          LIB CONNECT TO [Google BigQuery:Prod];
          [Salida]: LOAD AutoNumberHash128(cliente) AS surrogate_key;
          SQL SELECT cliente FROM \`p.d.ventas\` ORDER BY cliente;
        `),
      "AUTONUMBER_HASH_REQUIRES_QLIK_HASH",
    );
  });
});

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

async function expectCodeAsync(
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await fn();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

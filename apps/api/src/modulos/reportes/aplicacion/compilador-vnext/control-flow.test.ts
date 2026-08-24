import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";
import { parsearProgramaQlik } from "./parser-programa.js";

describe("control de flujo Qlik vNext", () => {
  it("construye un AST anidado para IF/ELSEIF/ELSE", () => {
    const program = parsearProgramaQlik(`
      IF 'A' = 'B' THEN
        SET vRama='if';
      ELSEIF 'A' = 'A' THEN
        SET vRama='elseif';
      ELSE
        SET vRama='else';
      END IF;
    `);

    expect(program.statements).toHaveLength(1);
    expect(program.statements[0]).toMatchObject({
      type: "if",
      branches: [
        { condition: "'A' = 'B'", statements: [{ type: "set" }] },
        { condition: "'A' = 'A'", statements: [{ type: "set" }] },
      ],
      elseStatements: [{ type: "set" }],
    });
  });

  it("reconoce control de flujo después de un comentario de bloque", () => {
    const program = parsearProgramaQlik(`
      /* comentario previo */
      IF 1 THEN
        SET vRama='if';
      END IF;
    `);

    expect(program.statements[0]?.type).toBe("if");
  });

  it("reconoce un encabezado de control con comentario de bloque inline", () => {
    const program = parsearProgramaQlik(`
      IF 1 THEN /* comentario inline */
        SET vRama='if';
      END IF;
    `);

    expect(program.statements[0]?.type).toBe("if");
  });

  it("pliega IF compile-time sin emitir el SQL de la rama descartada", async () => {
    const result = compilarDataflowVNext(`
      SET vModo='A';
      IF '$(vModo)'='A' THEN
        [Salida]: LOAD * INLINE [id\n1];
      ELSE
        [Salida]: LOAD * INLINE [id\n2];
      END IF;
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).not.toContain("2 AS `id`");
    expect(result.sql).not.toMatch(
      /\b(CASE|DECLARE|CREATE TEMP TABLE|LOOP)\b/i,
    );
  });

  it("emite valores INLINE quoted como literales SQL, no como texto con comillas", () => {
    const result = compilarDataflowVNext(`
      [Salida]: LOAD * INLINE [id,text
      1,"A"];
    `);

    expect(result.sql).toContain("'A' AS `text`");
    expect(result.sql).not.toContain("'\"A\"'");
  });

  it("desenrolla FOR finito y conserva las iteraciones en la salida", () => {
    const result = compilarDataflowVNext(`
      FOR vI = 1 TO 3
        [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
      NEXT vI;
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).toContain("3 AS `id`");
    expect(result.sql.match(/UNION ALL/g)).toHaveLength(2);
    expect(result.sql).not.toContain("FROM (\n");
  });

  it("desenrolla un FOR descendente con STEP explícito", () => {
    const result = compilarDataflowVNext(`
      FOR vI = 3 TO 1 STEP -1
        [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
      NEXT vI;
    `);

    expect(result.sql).toContain("3 AS `id`");
    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql.match(/UNION ALL/g)).toHaveLength(2);
  });

  it("expande SUB/CALL compile-time con parámetros", () => {
    const result = compilarDataflowVNext(`
      SUB Cargar(vTabla)
        [$(vTabla)]: LOAD * INLINE [id\n1];
      END SUB
      CALL Cargar('Salida');
    `);

    expect(result.sql).toContain("1 AS `id`");
  });

  it("pliega SWITCH y solo emite el CASE seleccionado", () => {
    const result = compilarDataflowVNext(`
      SET vModo='B';
      SWITCH '$(vModo)'
      CASE 'A'
        [Salida]: LOAD * INLINE [id\n1];
      CASE 'B'
        [Salida]: LOAD * INLINE [id\n2];
      DEFAULT
        [Salida]: LOAD * INLINE [id\n0];
      END SWITCH;
    `);

    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).not.toContain("1 AS `id`");
    expect(result.sql).not.toContain("0 AS `id`");
  });

  it("desenrolla DO WHILE cuando la variable de control prueba terminación", () => {
    const result = compilarDataflowVNext(`
      LET vI=1;
      DO WHILE $(vI) <= 3
        [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
        LET vI=$(vI)+1;
      LOOP;
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).toContain("3 AS `id`");
    expect(result.sql.match(/UNION ALL/g)).toHaveLength(2);
  });

  it("desenrolla DO..LOOP UNTIL y respeta la salida posterior al cuerpo", () => {
    const result = compilarDataflowVNext(`
      LET vI=1;
      DO
        [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
        LET vI=$(vI)+1;
      LOOP UNTIL $(vI) > 3;
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).toContain("3 AS `id`");
    expect(result.sql.match(/UNION ALL/g)).toHaveLength(2);
  });

  it("aplica EXIT FOR y no emite iteraciones posteriores", () => {
    const result = compilarDataflowVNext(`
      FOR vI = 1 TO 3
        [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
        EXIT FOR WHEN $(vI)=2;
      NEXT vI;
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).toContain("2 AS `id`");
    expect(result.sql).not.toContain("3 AS `id`");
  });

  it("aplica EXIT SCRIPT y descarta el resto del programa", () => {
    const result = compilarDataflowVNext(`
      [Salida]: LOAD * INLINE [id\n1];
      EXIT SCRIPT;
      [Salida]: LOAD * INLINE [id\n2];
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).not.toContain("2 AS `id`");
  });

  it("aplica EXIT SUB y no ejecuta el resto del cuerpo llamado", () => {
    const result = compilarDataflowVNext(`
      SUB Cargar()
        [Salida]: LOAD * INLINE [id\n1];
        EXIT SUB;
        [Salida]: LOAD * INLINE [id\n2];
      END SUB
      CALL Cargar();
    `);

    expect(result.sql).toContain("1 AS `id`");
    expect(result.sql).not.toContain("2 AS `id`");
  });

  it("no permite que un LOAD pendiente cruce una salida de SUB", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          SUB Cargar()
            LOAD id;
            EXIT SUB;
          END SUB
          CALL Cargar();
          LIB CONNECT TO [Google BigQuery:Prod];
          SQL SELECT id FROM \`p.d.t\`;
        `),
      "SYNTAX_LOAD_WITHOUT_SOURCE",
    );
  });

  it("desenrolla FOR EACH con valores literales", () => {
    const result = compilarDataflowVNext(`
      FOR EACH vModo IN 'A', 'B'
        [Salida]: LOAD '$(vModo)' AS modo AUTOGENERATE 1;
      NEXT vModo;
    `);

    expect(result.sql).toContain("'A' AS `modo`");
    expect(result.sql).toContain("'B' AS `modo`");
    expect(result.sql.match(/UNION ALL/g)).toHaveLength(1);
  });

  it("rechaza condiciones de control que dependen de runtime", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          IF flag > 0 THEN
            [Salida]: LOAD * INLINE [id\n1];
          END IF;
        `),
      "CONTROL_FLOW_RUNTIME_CONDITION_UNSUPPORTED",
    );
  });

  it("rechaza límites de FOR que dependen de runtime", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          FOR vI = 1 TO upperBound
            [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
          NEXT vI;
        `),
      "CONTROL_FLOW_RUNTIME_BOUND_UNSUPPORTED",
    );
  });

  it("rechaza EXIT fuera del contexto que puede controlar", () => {
    expectCode(
      () => compilarDataflowVNext("EXIT FOR;"),
      "CONTROL_FLOW_EXIT_CONTEXT_UNSUPPORTED",
    );
  });

  it("rechaza enumeración externa de FOR EACH sin adaptador", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          FOR EACH vFile IN FileList('lib://data/*.csv')
            [Salida]: LOAD * FROM [$(vFile)] (txt);
          NEXT vFile;
        `),
      "CONTROL_FLOW_EXTERNAL_ENUMERATION_UNSUPPORTED",
    );
  });

  it("rechaza listas FOR EACH que dependen de runtime", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          FOR EACH vModo IN modosDisponibles
            [Salida]: LOAD '$(vModo)' AS modo AUTOGENERATE 1;
          NEXT vModo;
        `),
      "CONTROL_FLOW_RUNTIME_ENUMERATION_UNSUPPORTED",
    );
  });

  it("rechaza DO WHILE compile-time que no demuestra terminación", () => {
    expectCode(
      () =>
        compilarDataflowVNext(`
          DO WHILE 1;
            LET vI=1;
          LOOP;
        `),
      "CONTROL_FLOW_NON_TERMINATING",
    );
  });
});

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("debió fallar");
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorCompilacionVNext);
    expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
  }
}

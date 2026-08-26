import { describe, expect, it } from "bun:test";
import { ErrorCompilacionVNext } from "./modelo.js";
import { escanearSentenciasQlik } from "./scanner-qlik.js";

const corpus = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/qlik/${name}`, import.meta.url);

describe("escanearSentenciasQlik", () => {
  it("solo usa punto y coma real como terminador", () => {
    const statements = escanearSentenciasQlik(`
// comentario ; no termina
SET v='a;b';
LOAD "x;y" AS [a;b], \`c;d\` AS x /* ; */;
SQL SELECT 'uno;dos' AS texto -- ; tampoco
FROM \`p.d.t\` WHERE id = 1;
`);

    expect(statements).toHaveLength(3);
    expect(statements[0]?.text).toContain("SET v='a;b'");
    expect(statements[1]?.text).toContain('LOAD "x;y"');
    expect(statements[2]?.text).toContain("SQL SELECT 'uno;dos'");
    expect(statements.every((item) => item.terminatedBySemicolon)).toBe(true);
  });

  it("mantiene el SQL multilinea del corpus como una sola sentencia", async () => {
    const script = await Bun.file(
      corpus("sql-native-comments-semicolons.qlik"),
    ).text();
    const statements = escanearSentenciasQlik(script);

    expect(statements).toHaveLength(3);
    expect(statements[2]?.text).toContain("'a;b' AS texto");
    expect(statements[2]?.text).toContain("FROM `p.d.a`");
    expect(statements[2]?.text).toContain("WHERE id > 0");
    expect(statements[2]?.span.line).toBe(3);
  });

  it("no interpreta CASE de GoogleSQL como CASE de SWITCH Qlik", () => {
    const statements = escanearSentenciasQlik(`
      LIB CONNECT TO [Google BigQuery:Prod];
      SQL SELECT
        CASE WHEN activo THEN 'A' ELSE 'B' END AS estado
      FROM \`p.d.t\`;
    `);

    expect(statements).toHaveLength(2);
    expect(statements[1]?.text).toContain("CASE WHEN activo");
  });

  it.each([
    ["LEXER_UNTERMINATED_STRING", "SET v='sin cierre;"],
    ["LEXER_UNTERMINATED_BLOCK_COMMENT", "LOAD a /* sin cierre;"],
    ["LEXER_UNTERMINATED_IDENTIFIER", "LOAD [sin cierre;"],
  ])("falla con diagnóstico estable %s", (code, script) => {
    try {
      escanearSentenciasQlik(script);
      throw new Error("debió fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCompilacionVNext);
      expect((error as ErrorCompilacionVNext).diagnostic.code).toBe(code);
    }
  });

  it.each(["If(", "If ("])(
    "no separa %s como IF procedural dentro de LOAD",
    (ifStart) => {
      const script = `[Calcular campos 1]:\nNOCONCATENATE\nLOAD\n  [ID_LOCAL],\n  ${ifStart}\n    [ID_LOCAL] = 0,\n    1,\n    0\n  ) AS [FILTRO_UOP];\nSELECT ID_LOCAL FROM \`p.d.uop\`;`;
      const statements = escanearSentenciasQlik(script);

      expect(statements).toHaveLength(2);
      expect(statements[0]?.text).toContain("NOCONCATENATE");
      expect(statements[0]?.text).toContain("AS [FILTRO_UOP]");
      expect(statements[0]?.text).toContain(ifStart);
      expect(statements[1]?.text).toStartWith("SELECT ID_LOCAL");
    },
  );

  it("no activa control procedural cuando If() contiene literal THEN como argumento", () => {
    const statements = escanearSentenciasQlik(
      "[A]: LOAD id, If(flag, 'THEN', 'ELSE') AS texto; SELECT id, flag FROM `p.d.t`;",
    );
    expect(statements).toHaveLength(2);
  });
});

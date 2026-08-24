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
});

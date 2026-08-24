import { describe, expect, it } from "bun:test";
import { compilarDataflowVNext } from "./index.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const root = new URL("../../fixtures/compiler-corpus/", import.meta.url);

type Scenario = {
  id: string;
  family: string;
  target: string;
  fixture: string;
};

const scenarios = JSON.parse(
  await Bun.file(new URL("scenarios.json", root)).text(),
) as { scenarios: Scenario[] };

describe("corpus ejecutable vNext", () => {
  it("contiene exactamente los 61 escenarios estructurales investigados", () => {
    expect(scenarios.scenarios).toHaveLength(61);
  });

  for (const scenario of scenarios.scenarios) {
    it(`${scenario.id}: compila o rechaza con diagnóstico vNext`, async () => {
      const script = await Bun.file(new URL(scenario.fixture, root)).text();
      try {
        const result = compilarDataflowVNext(script);
        expect(result.sql.trim()).not.toBe("");
        expect(result.strategy).toMatch(
          /^(source_sql_passthrough|single_query)$/,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorCompilacionVNext);
        const diagnostic = (error as ErrorCompilacionVNext).diagnostic;
        expect(diagnostic.code).not.toMatch(/INTERNAL/);
        expect(diagnostic.message.trim()).not.toBe("");
      }
    });
  }
});

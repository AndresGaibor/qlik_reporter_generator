import { describe, expect, it } from "bun:test";

type ManifestEntry = {
  id: string;
  surface: string;
  name: string;
  docs: string;
  strategy: string;
  semantic_status: string;
};

const fixture = (name: string) =>
  new URL(`../../fixtures/compiler-corpus/${name}`, import.meta.url);

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await Bun.file(fixture(name)).text()) as T;
}

describe("coverage gates del compilador vNext", () => {
  it("mantiene el manifiesto internamente consistente", async () => {
    const manifest = await json<{
      counts: Record<string, number>;
      entries: ManifestEntry[];
    }>("coverage-manifest.json");

    expect(manifest.counts.dataflow_processor).toBe(23);
    expect(manifest.counts.qlik_statement).toBe(80);
    expect(manifest.counts.qlik_operator).toBe(24);
    expect(manifest.counts.qlik_function).toBeGreaterThan(300);
    expect(manifest.counts.total).toBe(
      manifest.counts.dataflow_processor +
        manifest.counts.qlik_statement +
        manifest.counts.qlik_operator +
        manifest.counts.qlik_function,
    );
    expect(manifest.entries).toHaveLength(manifest.counts.total);
    expect(new Set(manifest.entries.map((entry) => entry.id)).size).toBe(
      manifest.entries.length,
    );

    for (const entry of manifest.entries) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.surface.trim()).not.toBe("");
      expect(entry.name.trim()).not.toBe("");
      expect(entry.docs).toStartWith("https://help.qlik.com/");
      expect(entry.strategy.trim()).not.toBe("");
      expect(entry.semantic_status.trim()).not.toBe("");
    }
  });

  it("cubre los 23 procesadores visuales con escenarios", async () => {
    const manifest = await json<{ entries: ManifestEntry[] }>(
      "coverage-manifest.json",
    );
    const corpus = await json<{
      scenarios: Array<{ processors?: string[]; fixture: string }>;
    }>("scenarios.json");
    const processors = manifest.entries
      .filter((entry) => entry.surface === "dataflow_processor")
      .map((entry) => entry.name)
      .sort();
    const covered = new Set(
      corpus.scenarios.flatMap((item) => item.processors ?? []),
    );

    expect(processors).toHaveLength(23);
    expect(processors.filter((name) => !covered.has(name))).toEqual([]);
    for (const scenario of corpus.scenarios) {
      expect(await Bun.file(fixture(scenario.fixture)).exists()).toBe(true);
    }
  });

  it("exige vectores base para cada entrada de función", async () => {
    const manifest = await json<{ entries: ManifestEntry[] }>(
      "coverage-manifest.json",
    );
    const vectors = await json<{
      functions: Array<{ name: string; category: string; vectors: string[] }>;
    }>("function-vectors.json");
    const required = ["normal", "null", "empty", "boundary", "type_coercion"];
    const functionEntries = manifest.entries.filter(
      (entry) => entry.surface === "qlik_function",
    );

    expect(functionEntries.length).toBe(manifest.entries.filter((entry) => entry.surface === "qlik_function").length);
    expect(vectors.functions).toHaveLength(functionEntries.length);
    for (const vector of vectors.functions) {
      for (const name of required) expect(vector.vectors).toContain(name);
    }
  });
});

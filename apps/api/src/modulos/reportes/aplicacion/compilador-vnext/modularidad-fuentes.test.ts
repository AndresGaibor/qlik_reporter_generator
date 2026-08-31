import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 600;

function listarTypeScript(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? listarTypeScript(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

function contarLineas(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

test("los módulos del compilador y descargas se mantienen por debajo de 600 líneas", () => {
  const roots = [
    import.meta.dir,
    join(import.meta.dir, "../../../descargas/http"),
  ];
  const oversized = roots
    .flatMap(listarTypeScript)
    .map((path) => ({ path, lines: contarLineas(path) }))
    .filter(({ lines }) => lines > MAX_LINES)
    .sort((a, b) => b.lines - a.lines);

  expect(oversized).toEqual([]);
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("identidad de Qlik Report", () => {
  const raiz = process.cwd();
  const favicon = resolve(raiz, "public/favicon.svg");
  const html = resolve(raiz, "index.html");

  it("publica el favicon SVG de la marca", () => {
    expect(existsSync(favicon)).toBe(true);
    const contenido = readFileSync(favicon, "utf8");
    expect(contenido).toContain('viewBox="0 0 64 64"');
    expect(contenido).toContain("#009845");
  });

  it("declara el favicon SVG en el documento", () => {
    const contenido = readFileSync(html, "utf8");
    expect(contenido).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );
    expect(contenido).toContain(
      '<meta name="theme-color" content="#009845" />',
    );
  });

  it("publica Qlik Report como nombre del producto", () => {
    const contenido = readFileSync(html, "utf8");
    expect(contenido).toContain("<title>Qlik Report</title>");
    expect(contenido).toContain(
      '<meta property="og:site_name" content="Qlik Report" />',
    );
    expect(contenido).not.toContain("Qlik Automate Creator");
  });
});

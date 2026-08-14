import { describe, expect, it } from "bun:test";

async function leer(nombre: string) {
  return Bun.file(new URL(`./${nombre}`, import.meta.url)).text();
}

describe("runtime del programador de reportes", () => {
  it("arranca en Bun y Node, pero no en Worker", async () => {
    const [bun, node, worker] = await Promise.all([
      leer("bun.ts"),
      leer("node.ts"),
      leer("worker.ts"),
    ]);

    expect(bun).toContain("iniciarProgramadorReportesAplicacion");
    expect(node).toContain("iniciarProgramadorReportesAplicacion");
    expect(worker).not.toContain("iniciarProgramadorReportesAplicacion");
    expect(worker).not.toContain("setInterval(");
  });
});

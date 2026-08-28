import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

describe("migración de reconciliación para compartir", () => {
  it("queda registrada después de cancelación y recrea ambas tablas de forma idempotente", async () => {
    const folder = fileURLToPath(new URL("../drizzle/", import.meta.url));
    const migrations = readMigrationFiles({ migrationsFolder: folder });
    const journal = JSON.parse(
      await Bun.file(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
      ).text(),
    ) as { entries: Array<{ tag: string; when: number }> };
    const cancelacion = journal.entries.find(
      ({ tag }) => tag === "0013_fuzzy_callisto",
    );
    const reconciliacion = journal.entries.find(
      ({ tag }) => tag === "0014_reconciliar_compartir_joseph",
    );
    const sql = await Bun.file(
      new URL(
        "../drizzle/0014_reconciliar_compartir_joseph.sql",
        import.meta.url,
      ),
    ).text();

    expect(migrations.length).toBe(journal.entries.length);
    expect(reconciliacion?.when).toBeGreaterThan(cancelacion?.when ?? 0);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "descargas_compartidas"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "reportes_compartidos"');
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });
});

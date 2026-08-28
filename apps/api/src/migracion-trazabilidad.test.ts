import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

describe("migración de trazabilidad BigQuery", () => {
  it("está registrada en la cadena Drizzle", async () => {
    const folder = fileURLToPath(new URL("../drizzle/", import.meta.url));
    const migrations = readMigrationFiles({ migrationsFolder: folder });
    const journal = JSON.parse(
      await Bun.file(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
      ).text(),
    ) as { entries: Array<{ tag: string }> };

    expect(migrations.length).toBe(journal.entries.length);
    expect(
      journal.entries.some(
        ({ tag }) => tag === "0007_trazabilidad_bigquery_jobs",
      ),
    ).toBe(true);
  });
});

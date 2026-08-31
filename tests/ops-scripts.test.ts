import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const leer = (ruta: string) => readFileSync(resolve(ROOT, ruta), "utf-8");

describe("scripts operativos de despliegue", () => {
  test("backup y restore respetan POSTGRES_USER configurable", () => {
    const backup = leer("scripts/ops/backup.sh");
    const restore = leer("scripts/ops/restore.sh");
    expect(backup).toContain('DB_USER="${POSTGRES_USER:-qlik_app}"');
    expect(restore).toContain('DB_USER="${POSTGRES_USER:-qlik_app}"');
    expect(backup).toContain('-U "$DB_USER"');
    expect(restore).toContain('-U "$DB_USER"');
    expect(backup).not.toContain("--clean");
    expect(restore).toContain("-v ON_ERROR_STOP=1");
  });

  test("restore recrea PostgreSQL fuera de una sentencia multi-comando", () => {
    const restore = leer("scripts/ops/restore.sh");
    expect(restore).not.toContain(
      '"DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;"',
    );
    expect(restore).toContain('"DROP DATABASE IF EXISTS $DB_NAME;"');
    expect(restore).toContain('"CREATE DATABASE $DB_NAME;"');
  });

  test("rollback cambia al ref Git solicitado y reconstruye servicios locales", () => {
    const rollback = leer("scripts/ops/rollback.sh");
    expect(rollback).toContain(
      'TARGET_COMMIT=$(git rev-parse --verify "${CURRENT_TAG}^{commit}")',
    );
    expect(rollback).toContain('git checkout --detach "$TARGET_COMMIT"');
    expect(rollback).toContain(
      'docker compose -f "$COMPOSE_FILE" build migrate api web',
    );
    expect(rollback).not.toContain(
      'docker compose -f "$COMPOSE_FILE" pull web',
    );
  });
});

# Task 1 — Reporte

## Status
DONE_WITH_CONCERNS

## RED evidence
- `bun test packages/contratos/src/reportes/dataflow.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts` falló antes de producción: el contrato todavía exigía configuración local/UUID y el repositorio todavía ejecutaba `innerJoin(reportes, ...)`.

## Files changed
- Contratos Dataflow y sus pruebas.
- Esquema Drizzle, puerto y repositorio PostgreSQL de ejecuciones.
- Migración `apps/api/drizzle/0006_persistir_ejecuciones_dataflow.sql`, snapshot `meta/0006_snapshot.json` y journal.

## Migration semantics
`0006` añade columnas nullable, hace backfill desde `reportes`, aborta si falta contexto histórico, aplica `NOT NULL`, agrega FKs sin cascade e índice de scope, elimina la FK/índice/columna `reporte_id` y finalmente elimina `reportes`. No modifica `automatizaciones_personales_qlik` ni se aplicó a la base local.

## Tests / commands
- Focal tests: PASS (4 tests).
- `bun run --cwd packages/contratos typecheck`: PASS.
- `bun run --cwd apps/api typecheck`: FAIL por consumidores legacy de la API de reportes aún pendientes de migración en tareas posteriores (`src/modulos/reportes/http/rutas-reportes-dataflow.ts`, servicios de ejecución/sincronización, tests de esquema y descargas).
- `git diff --check`: PASS.
- Migración runtime: no ejecutada, según requisito de Task 5.

## Commit
`be9eb6d0f23ad9f4a8b96f1a08f9d3e366150b2d` (amended after report inclusion).

## Concerns
La eliminación intencional de la superficie CRUD local deja consumidores legacy compilando contra el contrato anterior; la migración de esos consumidores debe completarse en tareas posteriores antes de exigir typecheck global verde.

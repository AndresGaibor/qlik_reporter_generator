# Legacy Schema and UI Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar esquema, infraestructura y UI legacy que ya no participan en el flujo Dataflow → Automate → Talend → BigQuery/GCS.

**Architecture:** Mantener los módulos Qlik/Google Cloud/reportes/descargas y simplificar persistencia alrededor de ellos. La eliminación se hace con una migración forward-only; la migración histórica consolidada no se reescribe.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, React/Vite, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-18-legacy-schema-and-ui-pruning-design.md`

## Global Constraints
- No ejecutar consultas BigQuery.
- No reescribir migraciones históricas aplicadas.
- Qlik Cloud y Google Cloud son las únicas integraciones externas directas.
- Mantener idempotencia y auditoría.
- Cada bloque termina con pruebas verdes y commit independiente.

---

### Task 1: Eliminar Outbox y tablas/campos legacy del modelo
**Files:** modificar `apps/api/src/plataforma/persistencia/esquema.ts`, `apps/api/src/app.ts`, creación desde plantilla, tests de arquitectura; crear migración forward-only.

- [ ] Escribir tests que prohíban tablas/símbolos legacy y Outbox.
- [ ] Ejecutar tests y confirmar rojo.
- [ ] Eliminar Outbox, caches Qlik, intentos OAuth sin consumidores y campos legacy del modelo.
- [ ] Generar/escribir migración que haga `DROP` seguro y normalice roles.
- [ ] Ejecutar tests focalizados, typecheck API y commit.

### Task 2: Retirar `/tablas` y catálogo/preview BigQuery
**Files:** eliminar `apps/web/src/modulos/tablas/**`; modificar router/navegación/layout y `apps/web/src/modulos/reportes/api.ts`; reducir `apps/api/src/modulos/destinos/**` y rutas montadas en `app.ts`.

- [ ] Escribir/actualizar tests de navegación para exigir ausencia de `/tablas`.
- [ ] Confirmar rojo.
- [ ] Eliminar UI Resultados y endpoints de catálogo/preview no usados, conservando el adaptador mínimo de dry-run.
- [ ] Ejecutar tests API/web, typechecks y commit.

### Task 3: Eliminar archivos huérfanos y simplificar roles
**Files:** borrar componentes productivos huérfanos confirmados; modificar contratos/admin/autenticación/esquema tests.

- [ ] Añadir pruebas/guards para `admin | usuario` y ausencia de módulos huérfanos relevantes.
- [ ] Confirmar rojo donde aplique.
- [ ] Eliminar archivos muertos y compatibilidad de roles `administrador/editor/auditor`.
- [ ] Ejecutar tests, typecheck y commit.

### Task 4: Aplicar migración y housekeeping en PostgreSQL local
**Files:** migración de Task 1; sin cambios BigQuery.

- [ ] Respaldar conteos y verificar las tablas objetivo antes de migrar.
- [ ] Aplicar migración local.
- [ ] Eliminar sesiones expiradas/revocadas e idempotencias expiradas con SQL local.
- [ ] Verificar esquema físico final contra Drizzle y commit de cualquier ajuste necesario.

### Task 5: Verificación integral y documentación
**Files:** README/docs vigentes solo si contienen referencias activas a la UX eliminada.

- [ ] Buscar `tablas`, `tablaId`, Outbox/caches y roles legacy en código activo.
- [ ] Ejecutar `bun test apps/api`, `bun run --cwd apps/web test:run`, typecheck, build, `bun run lint`, `git diff --check`.
- [ ] Verificar por UI en solo lectura `/flujos`, `/reportes`, `/descargas`.
- [ ] Integrar la rama a `main`, retirar worktree y repetir checks críticos.

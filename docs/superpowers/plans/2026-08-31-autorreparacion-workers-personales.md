# Autorreparacion de Workers Personales Qlik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparar automaticamente workers Qlik legacy, incompatibles u obsoletos dentro de la misma ejecucion de reporte mediante reemplazo seguro desde plantilla.

**Architecture:** Un caso de uso de aplicacion concentra validacion, copia, propietario, swap persistido y limpieza best-effort. Ejecucion y Administracion lo invocan bajo la identidad de lock existente; el contrato Talend se versiona sin admitir legacy.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM, PostgreSQL, Qlik Automate.

**Spec:** Requisitos aprobados en la solicitud del usuario del 2026-08-31.

## Global Constraints

- No parchear workspaces incompatibles in-place.
- No reparar ante errores de integracion distintos de GET 404.
- No modificar `ejecuciones_reportes.automatizacion_id_qlik` historicos.
- Dejar `contrato_version` NULL para filas existentes durante la migracion.
- Mantener `UNIQUE(usuario_id, tenant_qlik_id)`.
- No exponer IDs Qlik ni diagnosticos Talend en errores de usuario final.

---

### Task 1: Contrato versionado y persistencia

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.ts`
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Create: `apps/api/drizzle/0015_versionar_workers_personales.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/esquema.test.ts`

- [ ] Escribir tests RED para `VERSION_CONTRATO_TALEND`, la columna nullable y el mapeo persistido.
- [ ] Ejecutar `bun test apps/api/src/esquema.test.ts` y confirmar fallo por ausencia de columna/version.
- [ ] Implementar constante unica, tipos `contratoVersion`, columna Drizzle y migracion `ADD COLUMN` sin backfill.
- [ ] Ejecutar el test enfocado y confirmar PASS, incluyendo unique constraint intacta.

### Task 2: Caso de uso compartido de reemplazo

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/reemplazar-automatizacion-personal.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/reemplazar-automatizacion-personal.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.ts`

- [ ] Escribir tests RED para copia valida, copia incompatible, fallo DB, propietario, logs, limpieza vieja y reparacion forzada.
- [ ] Ejecutar el test nuevo y confirmar fallo por caso de uso inexistente.
- [ ] Implementar el flujo bajo lock con relectura, validacion estricta de plantilla, copia, validacion, propietario, swap y cleanup.
- [ ] Distinguir 404 de otros errores Qlik y devolver error generico con diagnostico tecnico.
- [ ] Ejecutar tests del servicio y confirmar PASS.

### Task 3: Integrar ejecucion automatica

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.test.ts`

- [ ] Cambiar tests existentes incompatible/version NULL/version antigua para esperar reparacion y no `WORKER_INCOMPATIBLE`.
- [ ] Ejecutar suite enfocada y confirmar RED.
- [ ] Delegar deteccion y reemplazo al servicio compartido, preservando lock y contrato estricto.
- [ ] Añadir/regresar test M del POST completo verificando HTTP 200 y auditoria con worker nuevo.
- [ ] Ejecutar tests de reportes y app y confirmar PASS.

### Task 4: Integrar Administracion

**Files:**
- Modify: `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.ts`
- Modify: `apps/api/src/modulos/admin/http/rutas-admin.ts`
- Modify: `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`

- [ ] Cambiar el test de recreacion para invocar el servicio compartido y validar `forzar: true`/propietario servidor.
- [ ] Ejecutar la suite y confirmar RED.
- [ ] Resolver el caso de uso en composition root y reducir la ruta a adaptacion HTTP/contexto.
- [ ] Ejecutar tests Admin y confirmar PASS sin duplicar copia/swap.

### Task 5: Documentacion y verificacion final

**Files:**
- Modify: `docs/superpowers/specs/2026-08-19-dataflow-como-reporte-design.md`
- Modify: `docs/superpowers/specs/2026-08-18-automatizaciones-personales-reportes-design.md`
- Modify: `docs/superpowers/plans/2026-08-18-automatizaciones-personales-reportes.md`

- [ ] Actualizar afirmaciones que exigen reparacion administrativa y documentar lazy migration, swap y fallos parciales.
- [ ] Ejecutar focused tests, `bun run test:backend`, `bun run test:web`, `bun run typecheck`, `bun run lint`, `bun run build` y `git diff --check`.
- [ ] Revisar diff, estado del worktree y limitaciones reales; no ejecutar prueba remota si no hay entorno autenticado disponible.

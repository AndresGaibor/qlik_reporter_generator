# Descargas Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que permisos, metadata y navegación de descargas sean deterministas y coherentes entre administrador, preview de usuario final y usuario real.

**Architecture:** Mantener autorización en backend, usar cookie de preview únicamente para reducir privilegios, persistir resultados de ejecución en la tabla existente y exponer una ruta Web canónica por ID. Las ejecuciones históricas conservan fallback a metadata de BigQuery.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, React/Vite, TanStack Query/Router, Vitest/Bun test.

**Spec:** `docs/superpowers/specs/2026-09-14-descargas-hardening-design.md`

## Global Constraints

- No ampliar permisos de usuarios finales.
- Preview de usuario final debe reducir permisos también en descargas directas.
- Mantener compatibilidad con enlaces antiguos `?ejecucion=`.
- No contar shards GCS como archivos agrupados.
- Cero registros no debe convertirse en un archivo ficticio.

---

### Task 1: Preview efectivo de usuario final

**Files:** `apps/web/src/app/layout-principal.tsx`, tests de app; `apps/api/src/modulos/descargas/http/rutas-descargas/helpers.ts`, rutas y tests de descargas.

- [ ] Escribir tests que demuestren que la cookie de preview se sincroniza y que admin+preview no accede a una ejecución ajena.
- [ ] Ejecutar tests y verificar fallo por comportamiento ausente.
- [ ] Implementar cookie y helper de administrador efectivo; usarlo en rutas de descargas.
- [ ] Ejecutar tests hasta verde y refactorizar sin ampliar alcance.

### Task 2: Historial y ruta canónica por ejecución

**Files:** `apps/web/src/modulos/descargas/rutas.tsx`, `pagina-descargas.tsx`, `api.ts`, historial de reportes y tests relacionados.

- [ ] Escribir tests para `/descargas/ejecuciones/<id>`, navegación desde historial y metadata admin.
- [ ] Verificar RED.
- [ ] Implementar ruta canónica y compatibilidad legacy.
- [ ] Verificar GREEN.

### Task 3: Persistir metadata real del resultado

**Files:** puerto/repositorio de reportes, `servicio-descargas.ts`, preparación de partes normalizadas y tests.

- [ ] Escribir tests para leer/persistir `resultados_ejecuciones_reportes` y preferirlo sobre heurística.
- [ ] Verificar RED.
- [ ] Agregar tipos/métodos de repositorio y upsert idempotente.
- [ ] Persistir tamaño, objetos fuente, partes, máximo aplicado y disponibilidad.
- [ ] Verificar GREEN.

### Task 4: Cero registros

**Files:** `servicio-descargas.ts` y tests.

- [ ] Escribir test donde `recordsWritten=0` resulte en `partesDescarga=0`.
- [ ] Verificar RED.
- [ ] Corregir cálculo y semántica `sin_archivos` cuando corresponda.
- [ ] Verificar GREEN.

### Task 5: Integración, remoto y producción

**Files:** todos los anteriores + documentación.

- [ ] Ejecutar tests focales API/Web, typecheck/build y `git diff --check`.
- [ ] Commit de la rama, integrar en `main` y verificar árbol limpio.
- [ ] Subir `main` a GitHub y confirmar SHA remoto.
- [ ] Construir y recrear API/Web en producción.
- [ ] Verificar health API, Web y HTTP 200 público.

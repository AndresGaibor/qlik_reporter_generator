# Compiler vNext Conformance Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir gates machine-readable que separen inventario tracked, runtime implemented, certificados con evidencia y escenarios intencionalmente no equivalentes, además de proteger la forma canónica del SQL generado.

**Architecture:** Un helper TypeScript valida los contratos declarativos y genera un reporte serializable. El mismo helper analiza SQL enmascarando comentarios/literales para medir SELECT, CTE, subquery, CASE, CAST y capas sintéticas sin confundir contenido de usuario con estructura. Los tests ejecutan todos los escenarios del corpus y aplican únicamente reglas SQL declaradas en el catálogo.

**Tech Stack:** Bun, TypeScript, bun:test, JSON fixtures, Biome.

**Spec:** `docs/superpowers/plans/2026-08-21-dataflow-bigquery-phase-5-conformance-migration.md` y `docs/research/2026-08-24-compiler-vnext-conformance-gates.md`.

## Global Constraints

- No ejecutar conformance contra tablas productivas.
- No inventar resultados Qlik ni marcar certificados sin `reference` y `golden` concretos.
- Mantener los conteos oficiales derivados del manifiesto/runtime, sin constantes de inventario en tests.
- No editar archivos Talend ni código de aplicación no relacionado.
- Preservar JOIN/WHERE/GROUP BY ALL nativos y mantener plano el filtro/proyección simple.

### Task 1: Endurecer el contrato declarativo y el reporte

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`

**Interfaces:**
- `validarContratoConformance(input)` seguirá devolviendo violaciones machine-readable.
- `generarReporteConformance(input, executions)` seguirá devolviendo un objeto JSON serializable.

- [ ] **Step 1: Write failing tests** para ejecuciones duplicadas/desconocidas/ausentes y runtime/vector entries fuera del inventario.
- [ ] **Step 2: Run focused tests** y confirmar que fallan por las nuevas violaciones faltantes.
- [ ] **Step 3: Implement minimal validation** y mantener métricas derivadas de las listas declarativas.
- [ ] **Step 4: Run focused tests** y confirmar que pasan.

### Task 2: Hacer canónicas las métricas de calidad SQL

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`

**Interfaces:**
- `evaluarCalidadSql(sql, expectation)` conservará su retorno `ResultadoCalidadSql`.

- [ ] **Step 1: Write failing tests** para ignorar keywords en comentarios/literales y no contar `WITH OFFSET` como CTE.
- [ ] **Step 2: Run focused tests** y confirmar el fallo esperado.
- [ ] **Step 3: Implement the minimal SQL scanner** con enmascarado estructural y conteo de cabezas `name AS (`.
- [ ] **Step 4: Run focused tests** y confirmar que pasan sin alterar los goldens existentes.

### Task 3: Integrar corpus, regresiones y documentación

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/cobertura-corpus.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/corpus-ejecutable.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`
- Modify: `docs/research/2026-08-24-compiler-vnext-conformance-gates.md`
- Modify: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/conformance-catalog.json`

- [ ] **Step 1: Add catalog rules** only for concrete structural goldens already present in the corpus.
- [ ] **Step 2: Run the complete focused compiler corpus suite**.
- [ ] **Step 3: Update docs** with generated metrics and the no-certificates policy without hardcoding inventory counts.

### Task 4: Verification and local commit

**Files:**
- Verify all changed files above; no Talend files.

- [ ] **Step 1: Run focused tests, API typecheck and Biome.**
- [ ] **Step 2: Inspect diff and status for scope.**
- [ ] **Step 3: Commit locally with a descriptive message; do not push.**

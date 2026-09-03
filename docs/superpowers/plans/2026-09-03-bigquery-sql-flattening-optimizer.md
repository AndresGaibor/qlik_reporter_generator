# BigQuery SQL Flattening Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir SQL BigQuery mínimo y plano cuando la equivalencia con la semántica Qlik esté demostrada, conservando capas cuando exista una barrera semántica.

**Architecture:** `optimizador-ir.ts` seguirá siendo el orquestador, pero las decisiones y sustituciones puras vivirán en `compilador-vnext/optimizador/`. Las transformaciones se harán sobre IR y el emisor solo absorberá patrones finales ya seguros; cualquier caso ambiguo conserva el SQL actual.

**Tech Stack:** TypeScript, Bun test, IR compiler-vNext, parser AST `ExprQlik`, emisor GoogleSQL/BigQuery.

**Spec:** `docs/superpowers/specs/2026-09-03-bigquery-sql-flattening-optimizer-design.md`

## Global Constraints
- Nunca consultar BigQuery, ejecutar dry-runs, leer metadata live ni modificar base de datos sin autorización explícita.
- Validación exclusivamente local.
- RED → GREEN → REFACTOR para cada cambio de comportamiento.
- No modificar el compilador legacy.
- No reescribir cuerpos de vistas BigQuery ni eliminar JOINs por columnas aparentemente no usadas.
- Toda transformación dudosa debe degradar al SQL conservador existente.

---

### Task 1: Sustitución estructural de expresiones Qlik

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/expresiones.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/expresiones.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.ts`

**Interfaces:**
- Consumes: `parsearExpresionQlik(text): ExprQlik`, `CampoLoadVNext[]`.
- Produces: `sustituirProyeccionEnExpresion(expression, projections): string | undefined` y `referenciasExpresion(expression): Set<string>`.

- [ ] **Step 1: Write failing AST substitution tests**
  - Alias directo: `Fecha` → `[Fecha]` permanece estable.
  - Alias calculado: `Anio = Year(Fecha)` dentro de `Anio = 2026` se sustituye estructuralmente.
  - Strings que contienen el nombre del alias no se tocan.
  - Identificadores con espacios/acentos se resuelven correctamente.
  - Alias inexistente/ambiguo devuelve `undefined` cuando no puede probarse la sustitución.

- [ ] **Step 2: Verify RED**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/expresiones.test.ts`
Expected: FAIL porque las funciones todavía no existen.

- [ ] **Step 3: Implement minimal structural substitution**
Parsear a `ExprQlik`, caminar recursivamente nodos `identifier/call/unary/binary`, sustituir solo identificadores presentes en el mapa de proyecciones y serializar con parentización conservadora. No usar regex para sustitución semántica.

- [ ] **Step 4: Verify GREEN and refactor**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/expresiones.test.ts`
Expected: PASS.

### Task 2: Normalización segura de filtros y proyecciones

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/capacidades.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

**Interfaces:**
- Consumes: relation graph + consumer counts.
- Produces: predicates `esProjectFusionable`, `esBarreraDePushdown`, `esRelacionCompartida` y rewrites idempotentes.

- [ ] **Step 1: Write failing optimizer tests**
  - `filter(project(native_sql))` queda `project(filter(native_sql))` cuando el project es seguro y de un solo consumidor.
  - Dos filtros consecutivos se fusionan con parentización explícita.
  - Proyección identidad real se elimina incluso sobre `native_sql`.
  - `distinct`, mapping, dual, `orderBy`, `stateful`, `limit` y project compartido bloquean el rewrite.

- [ ] **Step 2: Verify RED**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
Expected: FAIL por ausencia de las nuevas reglas.

- [ ] **Step 3: Implement conservative rewrites**
Calcular referencias/consumidores por iteración; fusionar filtros solo cuando el nodo intermedio no sea compartido; empujar filtro por project únicamente con sustitución estructural completa; redirigir IDs sin afectar ramas compartidas.

- [ ] **Step 4: Add motivating SQL regression**
Añadir un script inline estilo vista `VW_VENTAS_MENSUALES_QL` con proyección seguida de filtro `Fecha = Date#(...)` o literal equivalente y exigir un único bloque `SELECT ... FROM view WHERE ...`, sin `SELECT * FROM (`.

- [ ] **Step 5: Verify GREEN**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
Expected: PASS.

### Task 3: Pushdown seguro en INNER JOIN y barreras de outer join

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/capacidades.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`

**Interfaces:**
- Consumes: `referenciasExpresion`, `left.fields`, `right.fields`, join kind.
- Produces: clasificación `left | right | cross | ambiguous` para predicados sobre JOIN.

- [ ] **Step 1: Write failing JOIN tests**
  - INNER JOIN + predicado que solo usa un campo exclusivo de izquierda se empuja a izquierda.
  - INNER JOIN + predicado exclusivo de derecha se empuja a derecha.
  - Predicado que usa ambas ramas permanece encima del JOIN.
  - Campo presente en ambas ramas se considera ambiguo y no se empuja.
  - LEFT/RIGHT/FULL conservan el filtro exterior por defecto.

- [ ] **Step 2: Verify RED**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
Expected: FAIL en los casos nuevos de JOIN.

- [ ] **Step 3: Implement side-local INNER JOIN pushdown**
Crear un nodo filter nuevo con ID único determinista solo cuando el JOIN y su filtro tengan condiciones de uso seguras; actualizar únicamente la rama correspondiente y retirar el filtro exterior. No eliminar el JOIN ni inferir unicidad.

- [ ] **Step 4: Verify GREEN**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
Expected: PASS.

### Task 4: Barreras de cardinalidad, agregación, orden y UNION ALL

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador/capacidades.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

- [ ] **Step 1: Write failing barrier tests**
  - filtro sobre agregado no cruza `aggregate`;
  - filtro posterior a `limit/FIRST` no cruza el límite;
  - `stateful` y dual/mapping son barreras;
  - `sort` consumido por `limit/stateful` se conserva;
  - nested `UNION ALL` compatible se aplana sin wrappers extra;
  - ramas incompatibles conservan proyección adaptadora.

- [ ] **Step 2: Verify RED**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`
Expected: los nuevos contratos fallan antes de implementar las reglas.

- [ ] **Step 3: Implement barrier-aware cleanup**
Centralizar la clasificación de barreras. No cruzar aggregate/distinct/limit/stateful/mapping/dual/outer join. Extender aplanado de UNION únicamente cuando el esquema por posición/nombre sea idéntico y no haya campos internos.

- [ ] **Step 4: Verify GREEN**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
Expected: PASS.

### Task 5: Limpieza final del emisor sin semántica duplicada

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/principal.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/relacional.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

- [ ] **Step 1: Write failing SQL-shape tests**
Exigir ausencia de `SELECT * FROM (` en cadenas seguras, ausencia de CTEs de un solo uso, preservación del CTE compartido existente y opacidad de SQL nativo complejo (`WITH`, `HAVING`, `QUALIFY`, ventanas, PIVOT/UNPIVOT, set ops).

- [ ] **Step 2: Verify RED**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`
Expected: al menos el caso motivador falla antes del flattening final.

- [ ] **Step 3: Implement presentation-only flattening**
Eliminar únicamente wrappers que el IR optimizado marque implícitamente como innecesarios; mantener `wrap()` para barreras y SQL nativo complejo. No parsear SQL generado para tomar decisiones semánticas.

- [ ] **Step 4: Verify GREEN**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
Expected: PASS.

### Task 6: Conformance, idempotencia y verificación integral

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
- Modify only if needed for regression: compiler corpus fixtures/tests.

- [ ] **Step 1: Add idempotence and edge-case matrix**
Aplicar `optimizarPlanRelacionalVNext` dos veces y exigir igualdad estructural para planes cubiertos. Añadir quoted identifiers, espacios, acentos, alias collision, NULL comparison, project compartido y source SQL complejo.

- [ ] **Step 2: Run focused compiler suites**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/relacional.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 3: Run compiler conformance/corpus suites**
Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/cobertura-corpus.test.ts apps/api/src/modulos/reportes/aplicacion/compilador-vnext/corpus-ejecutable.test.ts`
Expected: PASS, 0 fail.

- [ ] **Step 4: Run typecheck and static diff checks**
Run: `bun run typecheck && git diff --check`
Expected: PASS.

- [ ] **Step 5: Verify no forbidden external access was introduced**
Review git diff and executed commands: no `bq`, BigQuery API calls, database commands or live metadata access used for validation.

- [ ] **Step 6: Commit implementation checkpoints**
Commit logically after expression utilities, relational rewrites, JOIN/barrier rules, and final regression verification. Do not include unrelated files.

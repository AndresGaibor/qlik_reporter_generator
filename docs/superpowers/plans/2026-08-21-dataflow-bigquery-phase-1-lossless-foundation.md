# Dataflow BigQuery Phase 1 — Lossless Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir el compilador vNext con frontera GoogleSQL lossless, guardas de inventario/corpus y una ruta segura para `LOAD *; SQL ...` que preserve JOIN/WHERE/GROUP/HAVING/QUALIFY/CTEs sin regex destructivos.

**Architecture:** El vNext vive en `compilador-vnext/` y no reemplaza todavía el compilador productivo. Un scanner Qlik lossless delimita sentencias; `SQL ...` se conserva como `NativeSqlSource.text`. El parser mínimo de fase 1 entiende conexión, etiquetas, `LOAD` simple/preciéndolo y SQL nativo; cualquier token semántico no consumido falla explícitamente.

**Tech Stack:** Bun, TypeScript, bun:test, BigQuery GoogleSQL.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints
- No silent drop: ninguna cláusula o sentencia puede desaparecer sin diagnóstico.
- `SQL` de una conexión BigQuery se conserva byte-for-byte salvo espacios exteriores y el prefijo `SQL`.
- El compilador actual sigue operativo durante esta fase.
- No commits ni push sin instrucción explícita del usuario.
- Toda regresión se demuestra red→green.

---

### Task 1: Coverage gates
**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/cobertura-corpus.test.ts`
- Read: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/coverage-manifest.json`
- Read: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/scenarios.json`
- Read: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/function-vectors.json`

**Interfaces:** Produces invariant tests only.

- [ ] Assert manifest counts are exactly the generated inventory counts and total equals entries length.
- [ ] Assert every entry has non-empty id/surface/name/docs/strategy/semantic_status.
- [ ] Assert every one of the 23 processors is referenced by at least one scenario.
- [ ] Assert every qlik_function entry has a function-vector descriptor with required base vectors.
- [ ] Run `bun test .../cobertura-corpus.test.ts` and require 0 failures.

### Task 2: Lossless scanner
**Files:**
- Create: `.../compilador-vnext/modelo.ts`
- Create: `.../compilador-vnext/scanner-qlik.ts`
- Create: `.../compilador-vnext/scanner-qlik.test.ts`

**Interfaces:**
- Produces `SourceSpan`, `SentenciaCruda`, `escanearSentenciasQlik(script): SentenciaCruda[]`.
- A statement exposes `text`, `span`, `terminatedBySemicolon`.

- [ ] Test semicolons in single/double/backtick/bracketed text and line/block comments.
- [ ] Test multiline SQL CTE/subquery and comment fixture remains one statement.
- [ ] Test unterminated quote/comment returns stable `LEXER_*` diagnostic.
- [ ] Implement state machine; no regex splitting.
- [ ] Run scanner tests.

### Task 3: Minimal Qlik AST and native SQL boundary
**Files:**
- Create: `.../compilador-vnext/ast.ts`
- Create: `.../compilador-vnext/parser-programa.ts`
- Create: `.../compilador-vnext/parser-programa.test.ts`

**Interfaces:**
- Produces `parsearProgramaQlik(script): QlikProgram`.
- AST nodes: `ConnectStatement`, `LoadStatement`, `NativeSqlStatement`, `StoreStatement`, `DropStatement`, `SetStatement`, `UnsupportedStatement`.
- `NativeSqlStatement.sql.text` preserves the full source query after `SQL`.

- [ ] Red test: `sql-native-multi-join.qlik` preserves every JOIN/ON/WHERE.
- [ ] Red test: `sql-native-cte-subquery.qlik` preserves WITH/subquery.
- [ ] Red test: `sql-native-having.qlik`, `sql-native-qualify-window.qlik`, pivot/unpivot/union remain intact.
- [ ] Implement recognition without parsing GoogleSQL internals.
- [ ] Reject SQL source when active connection is not BigQuery.
- [ ] Run parser tests.

### Task 4: Phase-1 semantic IR
**Files:**
- Create: `.../compilador-vnext/ir.ts`
- Create: `.../compilador-vnext/analizador-semantico.ts`
- Create: `.../compilador-vnext/analizador-semantico.test.ts`

**Interfaces:**
- Produces `PlanCompilacionVNext { output, relations, effects, diagnostics }`.
- Relation variants initially: `native_sql`, `project`, `filter`, `aggregate`, `sort`, `distinct`.

- [ ] Represent a standalone native SQL statement as one immutable relation.
- [ ] Associate a preceding `LOAD *` with the following native SQL source without changing the query.
- [ ] Preserve table label/output selection.
- [ ] Fail on unsupported LOAD syntax instead of approximating.
- [ ] Run semantic tests.

### Task 5: Canonical emitter for passthrough and safe wrappers
**Files:**
- Create: `.../compilador-vnext/emisor-bigquery.ts`
- Create: `.../compilador-vnext/emisor-bigquery.test.ts`
- Create: `.../compilador-vnext/index.ts`

**Interfaces:**
- Produces `compilarDataflowVNext(script): { sql, diagnostics, strategy }`.
- Passthrough `LOAD * + SQL` emits the native SQL itself, no artificial CTE.

- [ ] Red golden for `regression-ventas-mensuales-join.qlik`: JOIN, WHERE and GROUP BY ALL survive.
- [ ] Assert generated SQL has no `fuente_1`, `filtro_2`, or duplicated outer SELECT for `LOAD *`.
- [ ] Golden for CTE, HAVING, QUALIFY, UNION, PIVOT and UNPIVOT native fixtures.
- [ ] Implement passthrough emitter and stable formatting of outer wrappers only.
- [ ] Run vNext tests.

### Task 6: Shadow comparison adapter
**Files:**
- Create: `.../compilador-vnext/comparar-compiladores.ts`
- Create: `.../compilador-vnext/comparar-compiladores.test.ts`

**Interfaces:** Produces a comparison object; does not change execution path.

- [ ] Compare old/vNext success, diagnostics and normalized SQL.
- [ ] Ensure a vNext failure never falls back silently.
- [ ] Ensure comparison never starts Talend.
- [ ] Run tests and full backend suite.

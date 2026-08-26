# Qlik Stateful and Inter-Record Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile the supportable Qlik `Exists`, row counters, ordered `Peek`/`Previous`, and load-order `AutoNumber` semantics while rejecting cases whose order or proprietary hash behavior cannot be reproduced exactly.

**Architecture:** Keep inter-record recognition and validation in a dedicated `inter-record.ts` module. Extend the existing relation IR with an explicit stateful relation and proven `orderBy` metadata; emit a small number of CTEs/windows only for that relation, preserving the current clean SQL paths for ordinary loads. `Exists` resolves against relations loaded earlier, while `AutoNumberHash128/256` remains an explicit diagnostic until a verified Qlik hash implementation exists.

**Tech Stack:** Bun, TypeScript, Bun test, BigQuery GoogleSQL windows/CTEs.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md` and the approved user request.

## Global Constraints

- Preserve load order; `Peek` and `Previous` require proven order and must not use an unordered approximation.
- Prefer windows/CTEs only where stateful semantics require them; ordinary SQL emission remains unchanged.
- Do not edit arithmetic/variables files or mapping/ApplyMap code owned by other agents.
- Use `/Users/andresgaibor/.bun/bin/bun` for all Bun commands.
- Never add `.agent-*` files or `node_modules` to the commit.

---

### Task 1: Parser and stateful IR surface

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-carga.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-programa.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/inter-record.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/inter-record.test.ts`

- [x] Write parser/recognition tests for `LOAD DISTINCT`, `WHILE`, stateful calls, literal `Peek` offsets, and unsupported nested/proprietary cases.
- [x] Run the focused test and confirm it fails because the new parser/recognition surface is absent.
- [x] Add the smallest parser fields and dedicated stateful recognition types/helpers, plus `orderBy` metadata on relations.
- [x] Run the focused test and confirm it passes.

### Task 2: Semantic lowering and exact-order diagnostics

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/parser-carga.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/inter-record.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.test.ts`

- [x] Add failing tests for the fixture semantics, `Exists` against an earlier table, no-order rejection for `Peek`/`Previous`/`AutoNumber`, deterministic `WHILE IterNo() <= N`, and explicit `AutoNumberHash` rejection.
- [x] Run those tests and verify failures are missing stateful lowering/diagnostics rather than test setup errors.
- [x] Resolve prior loaded fields for `Exists`, propagate proven source/load order, and create stateful IR only for loads that need it.
- [x] Reject unsupported combinations instead of approximating order or proprietary hash behavior.
- [x] Run focused semantic tests and confirm they pass.

### Task 3: BigQuery emission and fixture integration

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/registro-funciones.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/funciones-fixtures.test.ts`

- [x] Add failing SQL assertions for `EXISTS`, `ROW_NUMBER`, `LAG`, `GENERATE_ARRAY`, and first-seen `AutoNumber` lowering.
- [x] Implement clean stateful SQL emission with only necessary CTEs/windows and explicit diagnostics for unsupported cases.
- [x] Run focused compiler-vnext tests and confirm all new assertions pass without changing ordinary SQL emission.

### Task 4: Full verification and local commit

**Files:**
- Project files changed by Tasks 1–3 only.

- [x] Run focused stateful tests.
- [x] Run all compiler-vnext tests.
- [x] Run API typecheck.
- [x] Run Biome on touched TypeScript files.
- [ ] Inspect the diff and commit only project changes, excluding `.agent-*` and `node_modules`.

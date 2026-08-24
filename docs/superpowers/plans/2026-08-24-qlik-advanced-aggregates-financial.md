# Qlik Advanced Aggregates and Financial Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the requested tracked Qlik range, statistical, string/basic aggregation, and financial functions with exact BigQuery SQL or explicit typed scalar lowering, without modifying the function registry or unrelated compiler families.

**Architecture:** Keep parsing and the declarative inventory unchanged. Add a dedicated aggregate/financial lowering module that receives typed expression emitters and emits native BigQuery aggregates, exact scalar-array formulas, or diagnostic recursive scalar SQL where BigQuery has no native equivalent. Pass proven source order and dual components into aggregate emission; reject order-sensitive functions when order metadata is absent.

**Tech Stack:** Bun, TypeScript, Bun test, BigQuery Standard SQL.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints

- Do not edit `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/registro-funciones.ts`.
- Scope is limited to tracked Range, Financial, Basic/String/Financial aggregation functions named by the request.
- Use exact/native BigQuery statistical SQL where available; never use `APPROX_*`.
- Preserve Qlik NULL, empty, dual, distinct, tie, and order semantics explicitly; fail closed when order cannot be proven.
- Do not touch mapping, inter-record, control-flow, temporal, or conformance implementation.
- Verify with `/Users/andresgaibor/.bun/bin/bun`, focused tests, compiler-vnext suite, API typecheck, and `git diff --check`.

---

### Task 1: Add failing aggregate/financial lowering contract tests

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/agregados-financieros.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.test.ts`

**Interfaces:**
- Consumes: `emitirExpresionBigQuery`, `compilarDataflowVNext`, existing parser and compiler fixtures.
- Produces: executable expectations for all requested function families, diagnostics for missing order, and proof that no `APPROX_*` lowering is emitted.

- [ ] **Step 1: Write failing tests** for native range statistics, exact scalar range formulas, string/basic aggregate SQL, financial formulas, and explicit order diagnostics. Include Qlik reference examples: `RangeFractile(0.24,1,2,4,6)=1.72`, `RangeKurtosis(1,2,4,7)=-0.285714...`, `RangeStdev(1,2,4)=1.527525...`, `RangeMode(1,2,9,2,4)=2`, and `RangeMode('a',4,'a',4)=NULL` as SQL invariants.
- [ ] **Step 2: Run the focused tests** with `/Users/andresgaibor/.bun/bin/bun test ...` and verify they fail because tracked functions are not lowered yet, not because of test setup.

### Task 2: Create the dedicated aggregate/financial SQL module

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/agregados-financieros.ts`

**Interfaces:**
- Consumes: parsed `ExprQlik` calls and callbacks for Qlik value/numeric/text emission.
- Produces: `emitirAgregadoFinanciero(...)` plus exact helper SQL for range statistics, range cash flows, ordered string aggregates, mode/only/first-sorted-value, and financial functions.

- [ ] **Step 1: Implement native/exact range lowering:** pairwise `RangeCorrel`, linear-interpolated `RangeFractile`, sample `RangeStdev`, bias-corrected sample excess `RangeKurtosis`, lexical `RangeMaxString`/`RangeMinString`, unique `RangeOnly`, and unique-mode `RangeMode`; ignore or reject values exactly as the official function semantics require.
- [ ] **Step 2: Implement exact range NPV/XNPV formulas and diagnostic recursive Newton scalar lowering for RangeIRR/XIRR**, using 365-day date differences and returning NULL for missing sign/domain requirements.
- [ ] **Step 3: Implement grouped `Mode`, `Only`, `FirstSortedValue`, `Concat`, `FirstValue`, `LastValue`, `MaxString`, `MinString`, `IRR`, `NPV`, `XIRR`, and `XNPV`, including DISTINCT, delimiter, sort weight, rank, null filtering, tie-to-NULL, and proven order checks.
- [ ] **Step 4: Implement scalar `BlackAndSchole`, `FV`, `nPer`, `Pmt`, `PV`, and `Rate` with guarded domains and deterministic formulas/recursive rate solving.
- [ ] **Step 5: Run the focused module tests and keep output free of `APPROX_`.

### Task 3: Integrate the module without changing the registry

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts`

**Interfaces:**
- Consumes: dedicated module and existing relation order metadata.
- Produces: tracked target functions are dispatched only through the dedicated module; aggregate environments contain source order/dual metadata; aggregate relations retain dual components without affecting other relation families.

- [ ] **Step 1: Add aggregate context metadata** to the expression environment and aggregate relation shape, preserving source `orderBy` and dual component expressions only for aggregate emission.
- [ ] **Step 2: Dispatch the requested tracked names before the generic runtime-status guard**, leaving every other tracked function rejected exactly as before and leaving `registro-funciones.ts` unchanged.
- [ ] **Step 3: Remove the old Mode/FirstSortedValue reservation only in favor of the dedicated lowering and preserve fail-closed diagnostics for unsupported order/tie cases.
- [ ] **Step 4: Run the focused tests and existing expression/relational tests.

### Task 4: Add executable coverage fixtures and finish verification

**Files:**
- Create: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/qlik-advanced-aggregate-financial-suite.qlik`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/funciones-fixtures.test.ts`

**Interfaces:**
- Consumes: integrated compiler and exact SQL lowerings.
- Produces: compiler-vnext fixture coverage for grouped aggregates, ordered strings, range functions, and financial formulas without touching conformance catalogs.

- [ ] **Step 1: Add the fixture** with explicit `ORDER BY` where required and grouped calls for each requested family.
- [ ] **Step 2: Assert structural SQL invariants** for native statistics, ARRAY/STRUCT scalar lowering, recursive Newton diagnostics, and no approximate functions.
- [ ] **Step 3: Run focused tests, the compiler-vnext suite, API typecheck, and `git diff --check`.
- [ ] **Step 4: Review the diff for prohibited files/families and commit only if the sandbox allows it; never push.

---

## Self-review

- Inventory/docs were consulted before lowering: Qlik documents pairwise RangeCorrel, linear interpolation for RangeFractile, sample RangeStdev, tie-to-NULL Mode/FirstSortedValue, lexical string ordering, 365-day XNPV/XIRR, and Newton-based IRR/XIRR.
- Every requested name is assigned to either native SQL, exact scalar-array SQL, or explicitly diagnosed recursive scalar SQL; no approximate function is allowed.
- The registry, mapping, inter-record, control-flow, temporal, and conformance files are outside the implementation surface.
